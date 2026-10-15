import "server-only";

import { randomUUID } from "node:crypto";

import sharp, { type Metadata } from "sharp";
import { z } from "zod";

import {
  buscarOriginal,
  eventoEhDoDono,
  gravarMoldura,
  moldurasDoEvento,
  registrarDownload,
  removerMoldura,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import {
  AREA_SEGURA,
  FAIXA_SUGERIDA,
  FORMATOS_MOLDURA,
  LIMITE_MOLDURA_BYTES,
  LIMITE_MOLDURA_TEXTO,
  MEDIDAS_MOLDURA,
  nomeComMoldura,
  TRANSPARENCIA_MINIMA,
  type FormatoMoldura,
} from "@/lib/moldura";
import {
  CHAVE_DE_MOLDURA,
  ERRO_SEM_ARMAZENAMENTO,
  gravarPublico,
  lerEnviado,
  lerMolduraPublica,
  modoEnvio,
  r2Configurado,
  removerOriginal,
  removerPublico,
  urlDeEnvio,
} from "@/lib/r2";
import { urlPublica } from "@/lib/url-publica";

import { itemLiberadoParaDownload } from "./downloads";
import { abrirOriginal } from "./imagens";
import { limiteAtingido } from "./limites";
import { lerArquivoDoOriginal } from "./miniatura-sem-marca";
import type { Credencial } from "./pedidos";

// Moldura do evento (docs/arquitetura.md, "Moldura do evento").
//
// O dono do evento envia uma arte em PNG com transparência por formato (story e feed). O arquivo
// vai direto do navegador ao R2 por URL assinada (tipo e tamanho na assinatura), numa chave
// temporária do bucket privado; ao confirmar, o servidor lê, confere (PNG de verdade, com canal
// alfa, medidas exatas, parte transparente) e regrava no bucket público: a moldura é imagem de
// divulgação, como a capa enviada. Sem R2 (só fora da produção), o PNG chega pela rota de envio
// simulado e fica em data:.
//
// Quem COMPROU a foto baixa o original já encaixado na moldura: mesma checagem do download do
// original (item de pedido pago do próprio cliente, src/servicos/downloads.ts), o original é
// lido do R2, encaixado (cover centralizado, girado pelo EXIF), coberto pela moldura e entregue
// em JPEG, sem gravar o resultado em lugar nenhum. A moldura nunca é aplicada sobre prévias.

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type MolduraConferida = { ok: true; png: Buffer } | { ok: false; erro: string };

/**
 * Confere o arquivo enviado como moldura do formato e devolve o PNG regravado (sem metadados).
 * Recusa o que não for PNG, não tiver canal alfa, não tiver as medidas exatas, passar do limite
 * ou quase não tiver área transparente (onde a foto aparece).
 */
export async function conferirMoldura(
  conteudo: Buffer,
  formato: FormatoMoldura,
): Promise<MolduraConferida> {
  const { largura, altura, rotulo } = MEDIDAS_MOLDURA[formato];
  const medidas = `${largura}×${altura}`;
  if (conteudo.length === 0) return { ok: false, erro: "Escolha um arquivo PNG." };
  if (conteudo.length > LIMITE_MOLDURA_BYTES) {
    return { ok: false, erro: `A moldura passa de ${LIMITE_MOLDURA_TEXTO}.` };
  }
  if (!conteudo.subarray(0, 8).equals(ASSINATURA_PNG)) {
    return { ok: false, erro: "A moldura precisa ser um arquivo PNG." };
  }
  let info: Metadata;
  try {
    info = await sharp(conteudo).metadata();
  } catch {
    return { ok: false, erro: "Não conseguimos ler este PNG." };
  }
  if (info.format !== "png") return { ok: false, erro: "A moldura precisa ser um arquivo PNG." };
  if (info.width !== largura || info.height !== altura) {
    return {
      ok: false,
      erro: `A moldura de ${rotulo.toLowerCase()} precisa ter ${medidas} pixels (esta tem ${info.width}×${info.height}).`,
    };
  }
  if (!info.hasAlpha) {
    return {
      ok: false,
      erro: "A moldura precisa ter transparência: a área transparente é onde a foto aparece.",
    };
  }

  try {
    // Medidas já conferidas: o limite de pixels segura um PNG malformado.
    const abrir = () => sharp(conteudo, { limitInputPixels: largura * altura });
    const { data, info: bruto } = await abrir()
      .ensureAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const canais = bruto.channels;
    let transparentes = 0;
    for (let i = canais - 1; i < data.length; i += canais) if (data[i] < 128) transparentes++;
    if (transparentes / (largura * altura) < TRANSPARENCIA_MINIMA) {
      return {
        ok: false,
        erro: "A moldura quase não tem área transparente: recorte a janela onde a foto aparece.",
      };
    }
    const png = await abrir().png({ compressionLevel: 9 }).toBuffer();
    return { ok: true, png };
  } catch {
    return { ok: false, erro: "Não conseguimos ler este PNG." };
  }
}

/**
 * Encaixa a foto na medida do formato (cover centralizado, girada pelo EXIF, transparência
 * achatada sobre branco) e cobre com a moldura. Devolve um JPEG sem metadados (sem o GPS do
 * original).
 */
export async function comporComMoldura(
  foto: Buffer,
  moldura: Buffer,
  formato: FormatoMoldura,
): Promise<Buffer> {
  const { largura, altura } = MEDIDAS_MOLDURA[formato];
  const base = await abrirOriginal(foto)
    .rotate()
    .resize(largura, altura, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .toBuffer();
  return sharp(base)
    .composite([{ input: moldura, left: 0, top: 0 }])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

/**
 * Modelo para o designer: PNG na medida do formato, com a faixa sugerida para a arte em azul
 * translúcido, a janela da foto transparente e a área segura (textos e logos dentro dela)
 * tracejada em limão. Sem texto: as fontes do servidor não são garantidas.
 */
export async function modeloDaMoldura(formato: FormatoMoldura): Promise<Buffer> {
  const { largura: w, altura: h } = MEDIDAS_MOLDURA[formato];
  const f = FAIXA_SUGERIDA[formato];
  const a = AREA_SEGURA[formato];
  const janela = { x: f.lados, y: f.topo, w: w - 2 * f.lados, h: h - f.topo - f.base };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><mask id="m"><rect width="${w}" height="${h}" fill="#fff"/><rect x="${janela.x}" y="${janela.y}" width="${janela.w}" height="${janela.h}" rx="24" fill="#000"/></mask></defs>
  <rect width="${w}" height="${h}" fill="#061A42" fill-opacity="0.72" mask="url(#m)"/>
  <rect x="${janela.x}" y="${janela.y}" width="${janela.w}" height="${janela.h}" rx="24" fill="none" stroke="#315CFF" stroke-width="4"/>
  <rect x="${a.lados}" y="${a.topo}" width="${w - 2 * a.lados}" height="${h - a.topo - a.base}" fill="none" stroke="#B8FF32" stroke-width="6" stroke-dasharray="28 18"/>
</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

// ---------------------------------------------------------------- Painel do dono

const entradaFormato = z.enum(FORMATOS_MOLDURA);
const entradaEvento = z.uuid();

/** Chave temporária do envio, no bucket privado (como as fotos em envio). */
function chaveDeEnvio(eventoId: string) {
  return `envios/molduras/${eventoId}/${randomUUID()}.png`;
}
const CHAVE_DE_ENVIO = /^envios\/molduras\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.png$/;

export type InicioDoEnvio = { erro: string } | { url: string; chave: string };

/**
 * Passo 1 do envio real: confere o dono, o tipo e o tamanho e devolve a URL assinada (PUT, ~15
 * min) com o tipo e o tamanho na assinatura. O arquivo não passa pelo Next.js.
 */
export async function iniciarEnvioDeMoldura(
  fotografoId: string,
  dados: { eventoId: unknown; formato: unknown; tamanho: unknown; tipo: unknown },
): Promise<InicioDoEnvio> {
  const eventoId = entradaEvento.safeParse(dados.eventoId);
  const formato = entradaFormato.safeParse(dados.formato);
  const tamanho = z.number().int().positive().safeParse(dados.tamanho);
  if (!eventoId.success || !formato.success) return { erro: "Evento não encontrado." };
  if (dados.tipo !== "image/png") return { erro: "A moldura precisa ser um arquivo PNG." };
  if (!tamanho.success || tamanho.data > LIMITE_MOLDURA_BYTES) {
    return { erro: `Envie um PNG de até ${LIMITE_MOLDURA_TEXTO}.` };
  }
  const modo = modoEnvio();
  if (modo === "indisponivel") return { erro: ERRO_SEM_ARMAZENAMENTO };
  if (modo !== "r2") return { erro: "Atualize a página para enviar a moldura." };
  if (!(await eventoEhDoDono(eventoId.data, fotografoId)))
    return { erro: "Evento não encontrado." };
  if (await limiteAtingido("moldura_envio_usuario", fotografoId)) {
    return { erro: "Muitos envios seguidos. Espere alguns minutos e tente de novo." };
  }
  const chave = chaveDeEnvio(eventoId.data);
  return { url: await urlDeEnvio(chave, tamanho.data, "image/png"), chave };
}

export type ResultadoDaMoldura = { ok: true } | { ok: false; erro: string };

/**
 * Passo 2: lê o arquivo enviado, confere e grava a moldura no bucket público. O envio temporário
 * é apagado sempre (aceito ou não); a moldura trocada também.
 */
export async function confirmarEnvioDeMoldura(
  fotografoId: string,
  dados: { eventoId: unknown; formato: unknown; chave: unknown },
): Promise<ResultadoDaMoldura> {
  const eventoId = entradaEvento.safeParse(dados.eventoId);
  const formato = entradaFormato.safeParse(dados.formato);
  if (!eventoId.success || !formato.success) return { ok: false, erro: "Evento não encontrado." };
  const chave = typeof dados.chave === "string" ? dados.chave : "";
  // A chave tem de ser de um envio de moldura deste evento (não lê outro objeto do bucket).
  if (CHAVE_DE_ENVIO.exec(chave)?.[1] !== eventoId.data) {
    return { ok: false, erro: "Envio não encontrado. Tente de novo." };
  }
  if (modoEnvio() !== "r2") return { ok: false, erro: ERRO_SEM_ARMAZENAMENTO };
  if (!(await eventoEhDoDono(eventoId.data, fotografoId))) {
    return { ok: false, erro: "Evento não encontrado." };
  }
  if (await limiteAtingido("moldura_envio_usuario", fotografoId)) {
    return { ok: false, erro: "Muitos envios seguidos. Espere alguns minutos e tente de novo." };
  }
  try {
    const enviado = await lerEnviado(chave, LIMITE_MOLDURA_BYTES);
    if (enviado.situacao === "ausente") {
      return { ok: false, erro: "O arquivo não chegou. Tente enviar de novo." };
    }
    if (enviado.situacao === "grande") {
      return { ok: false, erro: `A moldura passa de ${LIMITE_MOLDURA_TEXTO}.` };
    }
    const conferida = await conferirMoldura(enviado.conteudo, formato.data);
    if (!conferida.ok) return conferida;
    const destino = `eventos/${eventoId.data}/moldura-${formato.data}-${randomUUID()}.png`;
    await gravarPublico(destino, conferida.png, "image/png");
    return await gravarEApagarAnterior(fotografoId, eventoId.data, formato.data, destino);
  } finally {
    await removerOriginal(chave).catch((erro) =>
      console.error("[moldura] falha ao apagar o envio temporário", erro),
    );
  }
}

/**
 * Envio simulado (só fora da produção e sem R2): o PNG chega pela rota de envio simulado e fica
 * gravado em data:, como a capa enviada nesse modo.
 */
export async function salvarMolduraSimulada(
  fotografoId: string,
  dados: { eventoId: unknown; formato: unknown },
  conteudo: Buffer,
): Promise<ResultadoDaMoldura> {
  const eventoId = entradaEvento.safeParse(dados.eventoId);
  const formato = entradaFormato.safeParse(dados.formato);
  if (!eventoId.success || !formato.success) return { ok: false, erro: "Evento não encontrado." };
  if (modoEnvio() !== "simulado" || emProducao()) {
    return { ok: false, erro: "Atualize a página para enviar a moldura." };
  }
  if (!(await eventoEhDoDono(eventoId.data, fotografoId))) {
    return { ok: false, erro: "Evento não encontrado." };
  }
  if (await limiteAtingido("moldura_envio_usuario", fotografoId)) {
    return { ok: false, erro: "Muitos envios seguidos. Espere alguns minutos e tente de novo." };
  }
  const conferida = await conferirMoldura(conteudo, formato.data);
  if (!conferida.ok) return conferida;
  const valor = `data:image/png;base64,${conferida.png.toString("base64")}`;
  return gravarEApagarAnterior(fotografoId, eventoId.data, formato.data, valor);
}

async function gravarEApagarAnterior(
  fotografoId: string,
  eventoId: string,
  formato: FormatoMoldura,
  chave: string,
): Promise<ResultadoDaMoldura> {
  const gravada = await gravarMoldura(eventoId, fotografoId, formato, chave);
  if (!gravada.ok) {
    await apagarArquivo(chave);
    return { ok: false, erro: "Evento não encontrado." };
  }
  await apagarArquivo(gravada.anterior);
  return { ok: true };
}

/** Remove a moldura do formato (e o arquivo dela no bucket público). Só o dono. */
export async function removerMolduraDoEvento(
  fotografoId: string,
  dados: { eventoId: unknown; formato: unknown },
): Promise<ResultadoDaMoldura> {
  const eventoId = entradaEvento.safeParse(dados.eventoId);
  const formato = entradaFormato.safeParse(dados.formato);
  if (!eventoId.success || !formato.success) return { ok: false, erro: "Evento não encontrado." };
  const removida = await removerMoldura(eventoId.data, fotografoId, formato.data);
  if (!removida.ok) return { ok: false, erro: "Evento não encontrado." };
  await apagarArquivo(removida.anterior);
  return { ok: true };
}

/** Apaga o PNG de uma moldura do bucket público (data: e chave alheia são ignorados). */
async function apagarArquivo(chave: string | null) {
  if (!chave || !CHAVE_DE_MOLDURA.test(chave) || !r2Configurado()) return;
  await removerPublico(chave).catch((erro) =>
    console.error("[moldura] falha ao apagar a moldura antiga", erro),
  );
}

/** Endereço público de cada moldura do evento (imagem de divulgação), para o painel. */
export async function enderecosDasMolduras(
  eventoId: string,
): Promise<Record<FormatoMoldura, string | null>> {
  const molduras = await moldurasDoEvento(eventoId);
  return {
    story: molduras.story ? urlPublica(molduras.story) : null,
    feed: molduras.feed ? urlPublica(molduras.feed) : null,
  };
}

// ---------------------------------------------------------------- Download de quem comprou

/** O PNG da moldura gravada (R2 ou, fora da produção, data:), ou `null`. */
async function lerMoldura(chave: string): Promise<Buffer | null> {
  if (CHAVE_DE_MOLDURA.test(chave)) return r2Configurado() ? lerMolduraPublica(chave) : null;
  const dataUrl = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(chave);
  if (dataUrl && !emProducao()) return Buffer.from(dataUrl[1], "base64");
  return null;
}

export type FotoComMoldura =
  | { ok: true; imagem: Buffer; nomeArquivo: string }
  | { ok: false; motivo: "indisponivel" | "limite" };

/**
 * A foto comprada encaixada na moldura do evento. Mesma regra do original: só item de pedido
 * pago do próprio cliente (ou de quem tem o link do pedido). Vídeo, evento sem a moldura do
 * formato e original ilegível dão `indisponivel`, como qualquer recusa (não revela o motivo).
 */
export async function fotoComMoldura(
  itemId: unknown,
  formato: unknown,
  credencial: Credencial,
  ip: string | null,
): Promise<FotoComMoldura> {
  const id = z.uuid().safeParse(itemId);
  const qual = entradaFormato.safeParse(formato);
  if (!id.success || !qual.success) return { ok: false, motivo: "indisponivel" };

  // Antes de tudo, pelo IP: segura quem varre ids ou tokens.
  if (await limiteAtingido("moldura_ip", ip ?? "local")) return { ok: false, motivo: "limite" };
  const item = await itemLiberadoParaDownload(id.data, credencial);
  if (!item) return { ok: false, motivo: "indisponivel" };
  if (credencial.clienteId && (await limiteAtingido("moldura_usuario", credencial.clienteId))) {
    return { ok: false, motivo: "limite" };
  }

  const original = await buscarOriginal(item.fotoId);
  if (!original || original.tipo !== "foto") return { ok: false, motivo: "indisponivel" };
  const chaveMoldura = (await moldurasDoEvento(original.eventoId))[qual.data];
  if (!chaveMoldura) return { ok: false, motivo: "indisponivel" };

  try {
    const [foto, moldura] = await Promise.all([
      lerArquivoDoOriginal(original.chave),
      lerMoldura(chaveMoldura),
    ]);
    if (!foto || !moldura) return { ok: false, motivo: "indisponivel" };
    const imagem = await comporComMoldura(foto, moldura, qual.data);
    await registrarDownload(item.id, ip);
    return { ok: true, imagem, nomeArquivo: nomeComMoldura(original.nomeArquivo, qual.data) };
  } catch (erro) {
    console.error("[moldura] falha ao compor a foto", { item: item.id }, erro);
    return { ok: false, motivo: "indisponivel" };
  }
}
