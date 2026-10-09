// Envio real de fotos ao R2 (docs/arquitetura.md, "Upload"). O arquivo vai direto do navegador
// ao bucket privado por URL assinada e nunca passa pelo Next.js; o servidor só registra a foto
// (iniciarEnvio) e, depois que o arquivo chegou, confere e processa (confirmarEnvio).
//
// Por enquanto o processamento é síncrono, uma foto por chamada da Server Action de
// confirmação; ele vai para um job do Inngest depois (docs/tarefas.md, Fase 12).

import "server-only";

import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";
import { z } from "zod";

import {
  buscarFotoEmEnvio,
  concluirFoto,
  hashesDoEvento,
  listarFotosPresas,
  marcarFotoComErro,
  registrarFotosEmEnvio,
  salvarRostos,
  type ChavesDaFoto,
} from "@/dados";
import { dataDeCaptura } from "@/lib/exif";
import {
  ERRO_SEM_ARMAZENAMENTO,
  gravarPublico,
  lerOriginal,
  modoEnvio,
  moverOriginal,
  removerOriginal,
  tamanhoDoOriginal,
  urlDeEnvio,
} from "@/lib/r2";
import {
  ehErroDeCredencial,
  indexarRostos,
  nomeDoErro,
  provedorFacial,
} from "@/lib/reconhecimento";

import { gerarMiniatura, gerarPrevia } from "./imagens";

export const LIMITE_FOTO_BYTES = 30 * 1024 * 1024;
/** Fotos por chamada de iniciarEnvio (o navegador manda em lotes). */
export const FOTOS_POR_LOTE = 25;

const lote = z
  .array(
    z.object({
      nome: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/\.jpe?g$/i, "Só arquivos JPEG."),
      tamanhoBytes: z.number().int().positive().max(LIMITE_FOTO_BYTES, "Até 30 MB por foto."),
      /** SHA-256 do arquivo, calculado no navegador; conferido com o arquivo na confirmação. */
      hash: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  )
  .min(1)
  .max(FOTOS_POR_LOTE);

const idFoto = z.uuid();

/** Chaves no R2 de uma foto. O id do fotógrafo e do evento no caminho facilitam auditoria. */
export function chavesDaFoto(fotografoId: string, eventoId: string, fotoId: string) {
  const caminho = `${fotografoId}/${eventoId}/${fotoId}`;
  return {
    temporaria: `envios/${caminho}.jpg`,
    original: `originais/${caminho}.jpg`,
    previa: `previas/${caminho}.webp`,
    miniatura: `miniaturas/${caminho}.webp`,
  };
}

export type ItemDoEnvio = { fotoId: string; url: string } | { repetida: true };

/**
 * Registra um lote de fotos em `processando` e devolve, para cada arquivo (na mesma ordem), a
 * URL assinada para o navegador enviar o JPEG, ou `repetida` se a mesma foto (mesmo SHA-256)
 * já está pronta no evento ou aparece duas vezes no lote.
 */
export async function iniciarEnvio(
  fotografoId: string,
  eventoId: string,
  lista: unknown,
): Promise<{ erro: string } | { itens: ItemDoEnvio[] }> {
  if (modoEnvio() !== "r2") return { erro: ERRO_SEM_ARMAZENAMENTO };
  if (!z.uuid().safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  const dados = lote.safeParse(lista);
  if (!dados.success) {
    return { erro: `Envie de 1 a ${FOTOS_POR_LOTE} fotos JPEG de até 30 MB cada por vez.` };
  }

  const jaNoEvento = await hashesDoEvento(eventoId);
  const vistos = new Set<string>();
  const repetida = dados.data.map((a) => {
    const sim = jaNoEvento.has(a.hash) || vistos.has(a.hash);
    vistos.add(a.hash);
    return sim;
  });
  const novos = dados.data.filter((_, i) => !repetida[i]);

  const ids = await registrarFotosEmEnvio(eventoId, fotografoId, novos, (fotoId): ChavesDaFoto =>
    chavesDaFoto(fotografoId, eventoId, fotoId),
  );
  if (!ids) return { erro: "Evento não encontrado." };

  const urls = await Promise.all(
    novos.map((a, i) =>
      urlDeEnvio(chavesDaFoto(fotografoId, eventoId, ids[i]).temporaria, a.tamanhoBytes),
    ),
  );
  let proximo = 0;
  const itens = dados.data.map((_, i): ItemDoEnvio => {
    if (repetida[i]) return { repetida: true };
    const j = proximo++;
    return { fotoId: ids[j], url: urls[j] };
  });
  return { itens };
}

/** Recusa com mensagem para o fotógrafo; o arquivo temporário é apagado. */
class ArquivoRecusado extends Error {}

function ehJpeg(conteudo: Buffer) {
  return (
    conteudo.length > 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff
  );
}

/**
 * Confere e processa uma foto depois que o navegador terminou de enviá-la: tamanho, JPEG de
 * verdade pelo conteúdo e o SHA-256 informado no início; gera prévia e miniatura com marca
 * d'água no bucket público, move o original para `originais/` e marca a foto `pronta`. Em
 * qualquer falha, a foto fica em `erro` e a mensagem volta para a tela.
 */
export async function confirmarEnvio(
  fotografoId: string,
  fotoId: string,
): Promise<{ erro: string } | { eventoId: string }> {
  if (modoEnvio() !== "r2") return { erro: ERRO_SEM_ARMAZENAMENTO };
  if (!idFoto.safeParse(fotoId).success) return { erro: "Foto não encontrada." };
  const foto = await buscarFotoEmEnvio(fotoId, fotografoId);
  if (!foto?.chaveTemporaria || !foto.hash) return { erro: "Foto não encontrada." };

  const chaves = chavesDaFoto(fotografoId, foto.eventoId, foto.id);
  // A chave gravada tem de ser a temporária desta foto: nunca processa outro objeto.
  if (foto.chaveTemporaria !== chaves.temporaria) return { erro: "Foto não encontrada." };

  try {
    const tamanho = await tamanhoDoOriginal(chaves.temporaria);
    if (tamanho === null) {
      throw new ArquivoRecusado("O arquivo não chegou ao armazenamento. Envie de novo.");
    }
    if (tamanho > LIMITE_FOTO_BYTES) throw new ArquivoRecusado("Maior que 30 MB.");

    const original = await lerOriginal(chaves.temporaria);
    if (original.length > LIMITE_FOTO_BYTES) throw new ArquivoRecusado("Maior que 30 MB.");
    if (!ehJpeg(original)) {
      throw new ArquivoRecusado("O arquivo não é um JPEG. Exporte a foto em JPEG e envie de novo.");
    }
    const hash = createHash("sha256").update(original).digest("hex");
    if (hash !== foto.hash) {
      throw new ArquivoRecusado("O arquivo chegou diferente do escolhido. Envie de novo.");
    }

    let info: Metadata;
    try {
      info = await sharp(original).metadata();
    } catch {
      throw new ArquivoRecusado("Não foi possível ler a imagem. Exporte em JPEG e envie de novo.");
    }
    if (info.format !== "jpeg") {
      throw new ArquivoRecusado("O arquivo não é um JPEG. Exporte a foto em JPEG e envie de novo.");
    }

    const [previa, miniatura] = await Promise.all([
      gerarPrevia(original),
      gerarMiniatura(original),
    ]);
    await Promise.all([
      gravarPublico(chaves.previa, previa.buffer, "image/webp"),
      gravarPublico(chaves.miniatura, miniatura.buffer, "image/webp"),
    ]);
    await moverOriginal(chaves.temporaria, chaves.original);

    const concluiu = await concluirFoto(foto.id, {
      chaveOriginal: chaves.original,
      // Medidas como a foto aparece (já girada pelo EXIF), para a grade da galeria.
      largura: info.autoOrient.width,
      altura: info.autoOrient.height,
      capturadaEm: dataDeCaptura(info.exif),
    });
    if (!concluiu) return { erro: "Esta foto já foi processada." };
    await indexarRostosDaFoto(foto.eventoId, foto.id, original);
    return { eventoId: foto.eventoId };
  } catch (erro) {
    if (erro instanceof ArquivoRecusado) {
      await marcarFotoComErro(foto.id, erro.message);
      // O arquivo recusado não fica no bucket (a regra de ciclo de vida de envios/ é a reserva).
      await removerOriginal(chaves.temporaria).catch(() => {});
      return { erro: erro.message };
    }
    await marcarFotoComErro(foto.id, ERRO_PROCESSAMENTO);
    // Só o id: nada do conteúdo do arquivo vai para o log.
    console.error(`[envios] falha ao processar a foto ${foto.id}`, erro);
    return { erro: "Não foi possível processar a foto. Tente de novo." };
  }
}

const ERRO_PROCESSAMENTO = "Não foi possível processar a foto. Envie de novo.";

/**
 * Foto presa em `processando` há mais disto é revisada pelo job. A URL assinada de envio vale 15
 * minutos (VALIDADE_URL_S): com 30, um envio que ainda está subindo nunca é tocado.
 */
export const ESPERA_FOTO_PRESA_MS = 30 * 60 * 1000;
/**
 * Fotos revisadas por execução do job: cada uma pode levar alguns segundos (baixar até 30 MB,
 * gerar prévia e miniatura, cadastrar rostos), e a função tem tempo limitado.
 */
export const FOTOS_PRESAS_POR_VEZ = 5;

export type ResultadoFotosPresas = {
  revisadas: number;
  prontas: number;
  comErro: number;
};

/**
 * Job (docs/tarefas.md, Fase 12): fotos que ficaram em `processando` porque o navegador fechou
 * ou a confirmação falhou no meio. Para cada uma, o processamento normal (confirmarEnvio): ele
 * confere no R2 (HEAD) se o arquivo chegou e, se chegou e confere, gera as prévias e marca
 * `pronta`; senão, marca `erro` com a mensagem que o fotógrafo vê no painel. Sem o R2
 * configurado (desenvolvimento, testes, produção sem armazenamento), não faz nada.
 */
export async function revisarFotosPresas(agora = Date.now()): Promise<ResultadoFotosPresas> {
  const resultado: ResultadoFotosPresas = { revisadas: 0, prontas: 0, comErro: 0 };
  if (modoEnvio() !== "r2") return resultado;
  const presas = await listarFotosPresas(
    new Date(agora - ESPERA_FOTO_PRESA_MS),
    FOTOS_PRESAS_POR_VEZ,
  );
  for (const foto of presas) {
    resultado.revisadas++;
    try {
      const r = await confirmarEnvio(foto.enviadaPor, foto.id);
      if ("erro" in r) {
        // Registro sem arquivo temporário válido volta como "não encontrada" sem mudar de
        // status; marcar aqui evita que ele prenda a fila do job para sempre. Só muda se a foto
        // ainda estiver em `processando`.
        await marcarFotoComErro(foto.id, ERRO_PROCESSAMENTO);
        resultado.comErro++;
      } else {
        resultado.prontas++;
      }
    } catch (erro) {
      // confirmarEnvio já trata as falhas do processamento; aqui só o que escapou (banco fora).
      console.error(`[envios] falha ao revisar a foto presa ${foto.id}`, erro);
      resultado.comErro++;
    }
  }
  return resultado;
}

/**
 * Como terminou o cadastro dos rostos de uma foto: `indexada` (mesmo sem nenhum rosto),
 * `desligado` (sem o Rekognition configurado), `falha_credencial` (chave, região ou permissão
 * erradas: as outras fotos vão falhar igual) ou `falha` (problema só desta foto, ou passageiro).
 */
export type IndexacaoDeRostos = "indexada" | "desligado" | "falha_credencial" | "falha";

/**
 * Cadastra os rostos da foto no reconhecimento facial (com as credenciais REKOGNITION_*), para a
 * busca por selfie encontrá-la. Vai uma cópia reduzida (o Rekognition aceita até 5 MB) e já
 * girada pelo EXIF, para a posição do rosto bater com a prévia. Uma falha aqui nunca derruba o
 * envio (nunca lança): a foto continua à venda, só não aparece na busca por selfie. O resultado
 * serve ao painel, para avisar o fotógrafo em vez de contar a falha como feita.
 */
export async function indexarRostosDaFoto(
  eventoId: string,
  fotoId: string,
  original: Buffer,
): Promise<IndexacaoDeRostos> {
  if (provedorFacial() !== "rekognition") return "desligado";
  try {
    const imagem = await sharp(original)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    await salvarRostos(fotoId, await indexarRostos(eventoId, fotoId, imagem));
    return "indexada";
  } catch (erro) {
    // Só o id da foto e o nome do erro (ex.: UnrecognizedClientException): nada da imagem.
    console.error(
      `[envios] falha ao indexar os rostos da foto ${fotoId}: ${nomeDoErro(erro)}` +
        (erro instanceof Error ? ` (${erro.message})` : ""),
    );
    return ehErroDeCredencial(erro) ? "falha_credencial" : "falha";
  }
}
