import "server-only";

import { z } from "zod";

import {
  eventoDoDono,
  loteOriginaisDoDono,
  loteVendidasDoAutor,
  resumoVendidasDoAutor,
  type FiltroVendidas,
  registrarLoteDoDono,
  resumoOriginaisDoDono,
  type EventoDoDono,
  autorNoEvento,
  originalDoAutor,
  type ModoLoteOriginais,
  type OriginalDoDono,
  type ResumoOriginais,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { r2Configurado, urlDeDownload } from "@/lib/r2";
import { nomeDoArquivoOriginal, tipoDoOriginal } from "@/lib/arquivo-original";

import { limiteAtingido } from "./limites";
import { exigirCodigoDeAcao, MENSAGENS_CODIGO_ACAO } from "./codigo-acao";
import type { OriginalDaFoto } from "./original-da-foto";
import { contaDoPainel } from "./sessao";

// Download dos originais pelo AUTOR da foto (docs/CLAUDE.md, exceção à regra "nenhum original
// sem pedido pago"; docs/arquitetura.md, "Originais do autor").
//
// Regra: só a conta de fotógrafo que enviou a foto (`fotos.enviada_por`) baixa o original dela
// sem pedido pago, mesmo num evento colaborativo. Conferido no servidor a cada pedido.
//
// Duas formas:
//   - em lote, no evento que ele criou: só o dono do evento (`eventos.fotografo_id`), e só as
//     fotos dele ("vendidas" e "minhas"; as dos colaboradores ficam de fora);
//   - uma foto só ("individual"): o autor, dono ou colaborador, pela rota
//     /api/painel/original/[fotoId], que responde 302 para a URL assinada;
//   - em lote, na aba Fotos vendidas ("vendidas_geral"): as fotos que ele enviou e foram
//     vendidas em pedido pago, de qualquer evento (dono ou colaborador), com os filtros da tela
//     ou só as selecionadas. Cada foto é conferida no servidor a cada lote (autoria + pedido
//     pago); a liberação é uma só para a aba (não presa a um evento) e a auditoria grava uma
//     linha por evento de cada lote.
// Outro fotógrafo, cliente e gestor não passam. O gestor usa o painel com a própria conta de
// fotógrafo (não é personificação): baixa só as fotos que essa conta enviou.
//
// Como: URLs assinadas de GET (~15 min, com Content-Disposition de anexo), direto do R2; os
// arquivos nunca passam pelo Next.js. Cada lote ou foto conta num limite por usuário e fica
// registrado em `downloads_do_dono` (quem, evento, opção, quantos, IP; sem URLs). Com a
// verificação em duas etapas ligada, o código é pedido uma vez por evento, e a liberação (token
// assinado, preso ao usuário e ao evento) vale por 3 horas, para os lotes e as fotos individuais.
//
// Original no Google Drive (evento `hibrido`, protótipo): o Drive não tem URL assinada, então a
// "URL" entregue é a rota do próprio site /api/painel/originais/[eventoId]/[fotoId] com um token
// assinado de 15 minutos (preso ao usuário e à foto, como a URL assinada do R2), emitido só
// depois das mesmas conferências; a rota confere de novo a sessão, o token e a autoria e faz o
// streaming. O navegador baixa igual (mesma origem) e nunca recebe nada do Drive.

export const ORIGINAIS_POR_LOTE = 50;
export const VALIDADE_LIBERACAO_MS = 3 * 60 * 60 * 1000;
const PROPOSITO = "originais-do-dono";
/**
 * No lugar do evento, na liberação da aba Fotos vendidas: não é um UUID, então nunca vale como
 * liberação de um evento (nem a de um evento vale aqui).
 */
const LIBERACAO_VENDIDAS = "vendidas_geral";
const PROPOSITO_FLUXO = "original-do-autor-fluxo";
/** Validade do endereço de um original no Drive: a mesma das URLs assinadas do R2. */
export const VALIDADE_FLUXO_MS = 15 * 60 * 1000;

type Fluxo = { u: string; f: string };

/** Endereço (mesma origem) que entrega o original no Drive a este usuário, por 15 minutos. */
function enderecoDoFluxo(usuarioId: string, eventoId: string, fotoId: string) {
  const fluxo = assinar(
    PROPOSITO_FLUXO,
    { u: usuarioId, f: fotoId } satisfies Fluxo,
    VALIDADE_FLUXO_MS,
  );
  return `/api/painel/originais/${eventoId}/${fotoId}?${new URLSearchParams({ fluxo })}`;
}

export const MODOS_ORIGINAIS = [
  "vendidas",
  "minhas",
] as const satisfies readonly ModoLoteOriginais[];

export type ItemParaBaixar = {
  id: string;
  /** Nome do arquivo: o original saneado + 8 caracteres do id (único no evento) + extensão. */
  nome: string;
  url: string;
  bytes: number | null;
  /** Excluído pelo dono (só na opção "minhas"): a tela separa numa pasta. */
  excluida: boolean;
};

export type ResultadoLote =
  | { ok: true; itens: ItemParaBaixar[]; proximo: string | null; indisponiveis: string[] }
  | { ok: false; motivo: "nao_encontrado" | "liberacao" | "limite" | "invalido"; erro: string };

const ERROS = {
  nao_encontrado: "Evento não encontrado.",
  liberacao: "A liberação do download venceu. Libere de novo para continuar.",
  limite: "Muitos lotes seguidos. Espere um minuto: o download continua sozinho.",
  invalido: "Pedido inválido.",
} as const;

/** Evento e conta, se o usuário logado for o dono; senão `null`. Nunca confia no navegador. */
export async function donoDoEvento(
  usuario: Usuario | null,
  eventoId: string,
): Promise<{ evento: EventoDoDono; fotografoId: string } | null> {
  if (!usuario || !z.uuid().safeParse(eventoId).success) return null;
  const conta = await contaDoPainel(usuario);
  if (!conta) return null;
  const evento = await eventoDoDono(eventoId, conta.id);
  return evento ? { evento, fotografoId: conta.id } : null;
}

/** Quantidade e tamanho das duas opções, para a tela (só para o dono; `null` para os outros). */
export async function resumoParaODono(
  usuario: Usuario | null,
  eventoId: string,
): Promise<Record<ModoLoteOriginais, ResumoOriginais> | null> {
  const dono = await donoDoEvento(usuario, eventoId);
  if (!dono) return null;
  const [vendidas, minhas] = await Promise.all(
    MODOS_ORIGINAIS.map((m) => resumoOriginaisDoDono(eventoId, dono.fotografoId, m)),
  );
  return { vendidas, minhas };
}

type Liberacao = { u: string; e: string };

/**
 * Libera o download dos originais do evento para o dono: confere a verificação em duas etapas
 * (se ligada) e devolve o token da liberação.
 */
export async function liberarOriginais(
  usuario: Usuario | null,
  eventoId: string,
  codigo: unknown,
): Promise<{ ok: true; liberacao: string } | { ok: false; erro: string; pedeCodigo?: boolean }> {
  const dono = await donoDoEvento(usuario, eventoId);
  if (!dono || !usuario) return { ok: false, erro: ERROS.nao_encontrado };
  return emitirLiberacao(usuario, eventoId, codigo);
}

/**
 * Libera o download individual das fotos que o usuário enviou ao evento (dono ou colaborador):
 * mesma liberação dos lotes, mas basta ser autor de alguma foto do evento. Cada foto é conferida
 * de novo na entrega (`originalIndividual`).
 */
export async function liberarOriginaisDoAutor(
  usuario: Usuario | null,
  eventoId: string,
  codigo: unknown,
): Promise<{ ok: true; liberacao: string } | { ok: false; erro: string; pedeCodigo?: boolean }> {
  if (!usuario || !z.uuid().safeParse(eventoId).success) {
    return { ok: false, erro: ERROS.nao_encontrado };
  }
  const conta = await contaDoPainel(usuario);
  if (!conta || !(await autorNoEvento(eventoId, conta.id))) {
    return { ok: false, erro: ERROS.nao_encontrado };
  }
  return emitirLiberacao(usuario, eventoId, codigo);
}

async function emitirLiberacao(
  usuario: Usuario,
  eventoId: string,
  codigo: unknown,
): Promise<{ ok: true; liberacao: string } | { ok: false; erro: string; pedeCodigo?: boolean }> {
  // Com a verificação em duas etapas ligada, pede o código enviado ao e-mail.
  const resultado = await exigirCodigoDeAcao(usuario, "originais", codigo);
  if (resultado !== "ok") {
    return { ok: false, erro: MENSAGENS_CODIGO_ACAO[resultado], pedeCodigo: true };
  }
  const dados: Liberacao = { u: usuario.id, e: eventoId };
  return { ok: true, liberacao: assinar(PROPOSITO, dados, VALIDADE_LIBERACAO_MS) };
}

/**
 * A liberação (token assinado de 3 h) é deste usuário e deste evento. Também vale para a foto com
 * a moldura do evento, que o autor baixa pelo painel (src/servicos/molduras.ts).
 */
export function liberacaoConfere(token: string, usuarioId: string, eventoId: string) {
  const dados = conferirAssinatura(PROPOSITO, token) as Partial<Liberacao> | null;
  return dados?.u === usuarioId && dados?.e === eventoId;
}

const pedidoDeLote = z.object({
  eventoId: z.uuid(),
  modo: z.enum(MODOS_ORIGINAIS),
  liberacao: z.string().min(20).max(1000),
  depois: z.uuid().nullish(),
  ids: z.array(z.uuid()).min(1).max(ORIGINAIS_POR_LOTE).optional(),
});

/** Nome do arquivo no disco: legível, sem caracteres problemáticos e único no evento. */
export function nomeDoOriginal(item: Pick<OriginalDoDono, "id" | "nomeArquivo" | "chave">) {
  const completo = nomeDoArquivoOriginal(item.nomeArquivo, item.chave);
  const ext = tipoDoOriginal(item.chave).extensao;
  const base = completo
    .slice(0, completo.lastIndexOf(".") > 0 ? completo.lastIndexOf(".") : undefined)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  return `${base || "foto"}_${item.id.slice(0, 8)}.${ext}`;
}

/** Endereço para baixar o original, ou `null` se ele não está disponível neste ambiente. */
async function enderecoDoOriginal(
  item: OriginalDoDono,
  nome: string,
  contexto: {
    eventoId: string;
    modo: ModoLoteOriginais | "vendidas_geral";
    liberacao: string;
    usuarioId: string;
  },
) {
  if (item.chave.startsWith("originais/") && item.provedorOriginal === "drive") {
    return item.driveArquivoId
      ? enderecoDoFluxo(contexto.usuarioId, contexto.eventoId, item.id)
      : null;
  }
  if (item.chave.startsWith("originais/")) {
    if (!r2Configurado()) return null;
    return urlDeDownload(item.chave, nome, tipoDoOriginal(item.chave).mime);
  }
  // Dados de exemplo (só fora da produção): a rota do painel confere tudo de novo e entrega a
  // imagem de exemplo (o CSP não deixa o navegador buscar outro host direto).
  if (/^https:\/\//.test(item.chave) && !emProducao()) {
    const busca = new URLSearchParams({ modo: contexto.modo, liberacao: contexto.liberacao });
    return `/api/painel/originais/${contexto.eventoId}/${item.id}?${busca}`;
  }
  // Ainda em envio (envios/...): não baixa.
  return null;
}

/**
 * Próximo lote de URLs assinadas para o dono (até 50): depois do id `depois`, ou só os `ids`
 * pedidos (repetir falhas, renovar URL vencida). `proximo` é o cursor do lote seguinte, ou `null`
 * no fim.
 */
export async function loteDeOriginais(
  usuario: Usuario | null,
  entrada: unknown,
  ip: string | null,
): Promise<ResultadoLote> {
  const pedido = pedidoDeLote.safeParse(entrada);
  if (!pedido.success) return { ok: false, motivo: "invalido", erro: ERROS.invalido };
  const { eventoId, modo, liberacao, depois, ids } = pedido.data;

  const dono = await donoDoEvento(usuario, eventoId);
  if (!dono || !usuario) return { ok: false, motivo: "nao_encontrado", erro: ERROS.nao_encontrado };
  if (!liberacaoConfere(liberacao, usuario.id, eventoId)) {
    return { ok: false, motivo: "liberacao", erro: ERROS.liberacao };
  }
  if (await limiteAtingido("originais_dono_usuario", usuario.id)) {
    return { ok: false, motivo: "limite", erro: ERROS.limite };
  }

  const linhas = await loteOriginaisDoDono({
    eventoId,
    fotografoId: dono.fotografoId,
    modo,
    limite: ORIGINAIS_POR_LOTE,
    depois: ids ? null : depois,
    ids,
  });
  const itens: ItemParaBaixar[] = [];
  const indisponiveis: string[] = [];
  for (const item of linhas) {
    const nome = nomeDoOriginal(item);
    const url = await enderecoDoOriginal(item, nome, {
      eventoId,
      modo,
      liberacao,
      usuarioId: usuario.id,
    });
    if (!url) {
      indisponiveis.push(item.id);
      continue;
    }
    itens.push({ id: item.id, nome, url, bytes: item.tamanhoBytes, excluida: item.excluida });
  }
  await registrarLoteDoDono({
    eventoId,
    fotografoId: dono.fotografoId,
    usuarioId: usuario.id,
    modo,
    quantidade: itens.length,
    ip,
  });
  const fim = ids || linhas.length < ORIGINAIS_POR_LOTE;
  return { ok: true, itens, proximo: fim ? null : linhas[linhas.length - 1].id, indisponiveis };
}

/**
 * Um original de exemplo (fora da produção), para a rota do painel: confere o dono, a liberação
 * e que o item está na opção pedida. `null` em qualquer recusa.
 */
export async function originalDeExemploParaODono(
  usuario: Usuario | null,
  entrada: { eventoId: string; fotoId: string; modo: unknown; liberacao: unknown },
): Promise<{ url: string; nome: string } | null> {
  if (emProducao()) return null;
  if (entrada.modo === "vendidas_geral") return vendidaDeExemploParaOAutor(usuario, entrada);
  const pedido = pedidoDeLote.safeParse({
    eventoId: entrada.eventoId,
    modo: entrada.modo,
    liberacao: entrada.liberacao,
    ids: [entrada.fotoId],
  });
  if (!pedido.success || !usuario) return null;
  const dono = await donoDoEvento(usuario, pedido.data.eventoId);
  if (!dono || !liberacaoConfere(pedido.data.liberacao, usuario.id, pedido.data.eventoId)) {
    return null;
  }
  const [item] = await loteOriginaisDoDono({
    eventoId: pedido.data.eventoId,
    fotografoId: dono.fotografoId,
    modo: pedido.data.modo,
    limite: 1,
    ids: pedido.data.ids,
  });
  if (!item || !/^https:\/\//.test(item.chave)) return null;
  return { url: item.chave, nome: nomeDoOriginal(item) };
}

// ---------------------------------------------------------------- Fotos vendidas (todas)

const filtroDasVendidas = z
  .object({
    eventoId: z.uuid().nullish(),
    de: z.iso.date().nullish(),
    ate: z.iso.date().nullish(),
    comprador: z.string().trim().max(120).nullish(),
  })
  .strict();

const pedidoDeLoteVendidas = z.object({
  filtro: filtroDasVendidas.default({}),
  liberacao: z.string().min(20).max(1000),
  depois: z.uuid().nullish(),
  ids: z.array(z.uuid()).min(1).max(ORIGINAIS_POR_LOTE).optional(),
});

/** Lê o filtro da aba (endereço da página ou pedido do navegador); inválido vira vazio. */
export function lerFiltroDasVendidas(entrada: unknown): FiltroVendidas {
  const lido = filtroDasVendidas.safeParse(entrada);
  return lido.success ? lido.data : {};
}

/**
 * Libera o download em lote da aba Fotos vendidas: basta ter conta de fotógrafo (cada foto é
 * conferida de novo a cada lote); pede o código da verificação em duas etapas, se ligada. Vale 3
 * horas, só para esta aba.
 */
export async function liberarVendidasDoAutor(
  usuario: Usuario | null,
  codigo: unknown,
): Promise<{ ok: true; liberacao: string } | { ok: false; erro: string; pedeCodigo?: boolean }> {
  if (!usuario) return { ok: false, erro: ERROS.nao_encontrado };
  const conta = await contaDoPainel(usuario);
  if (!conta) return { ok: false, erro: ERROS.nao_encontrado };
  return emitirLiberacao(usuario, LIBERACAO_VENDIDAS, codigo);
}

/** Quantas fotos e quantos bytes o "Baixar todas do filtro" baixa (`null` sem conta). */
export async function resumoVendidasParaOAutor(usuario: Usuario | null, filtro: unknown) {
  if (!usuario) return null;
  const conta = await contaDoPainel(usuario);
  if (!conta) return null;
  return resumoVendidasDoAutor(conta.id, lerFiltroDasVendidas(filtro));
}

/** Nome no disco: o começo do endereço do evento, para separar os eventos numa pasta só. */
function nomeDaVendida(item: OriginalDoDono & { eventoSlug: string }) {
  const evento = item.eventoSlug.slice(0, 40).replace(/[^\w-]+/g, "_");
  return `${evento}_${nomeDoOriginal(item)}`;
}

/**
 * Próximo lote de URLs assinadas da aba Fotos vendidas (até 50): depois do id `depois`, ou só
 * os `ids` pedidos (as selecionadas, repetir falhas, renovar URL vencida). Mesmo limite e mesma
 * validade de liberação dos lotes do dono; auditoria com o modo "vendidas_geral", uma linha por
 * evento do lote.
 */
export async function loteDeVendidasDoAutor(
  usuario: Usuario | null,
  entrada: unknown,
  ip: string | null,
): Promise<ResultadoLote> {
  const pedido = pedidoDeLoteVendidas.safeParse(entrada);
  if (!pedido.success) return { ok: false, motivo: "invalido", erro: ERROS.invalido };
  const { filtro, liberacao, depois, ids } = pedido.data;
  if (!usuario) return { ok: false, motivo: "nao_encontrado", erro: ERROS.nao_encontrado };
  const conta = await contaDoPainel(usuario);
  if (!conta) return { ok: false, motivo: "nao_encontrado", erro: ERROS.nao_encontrado };
  if (!liberacaoConfere(liberacao, usuario.id, LIBERACAO_VENDIDAS)) {
    return { ok: false, motivo: "liberacao", erro: ERROS.liberacao };
  }
  if (await limiteAtingido("originais_dono_usuario", usuario.id)) {
    return { ok: false, motivo: "limite", erro: ERROS.limite };
  }

  const linhas = await loteVendidasDoAutor({
    fotografoId: conta.id,
    filtro,
    limite: ORIGINAIS_POR_LOTE,
    depois: ids ? null : depois,
    ids,
  });
  const itens: ItemParaBaixar[] = [];
  const indisponiveis: string[] = [];
  const porEvento = new Map<string, number>();
  for (const item of linhas) {
    const nome = nomeDaVendida(item);
    const url = await enderecoDoOriginal(item, nome, {
      eventoId: item.eventoId,
      modo: "vendidas_geral",
      liberacao,
      usuarioId: usuario.id,
    });
    if (!url) {
      indisponiveis.push(item.id);
      continue;
    }
    itens.push({ id: item.id, nome, url, bytes: item.tamanhoBytes, excluida: item.excluida });
    porEvento.set(item.eventoId, (porEvento.get(item.eventoId) ?? 0) + 1);
  }
  for (const [eventoId, quantidade] of porEvento) {
    await registrarLoteDoDono({
      eventoId,
      fotografoId: conta.id,
      usuarioId: usuario.id,
      modo: "vendidas_geral",
      quantidade,
      ip,
    });
  }
  const fim = ids || linhas.length < ORIGINAIS_POR_LOTE;
  return { ok: true, itens, proximo: fim ? null : linhas[linhas.length - 1].id, indisponiveis };
}

/** O exemplo do lote da aba Fotos vendidas: confere a liberação da aba e a foto no lote do autor. */
async function vendidaDeExemploParaOAutor(
  usuario: Usuario | null,
  entrada: { eventoId: string; fotoId: string; liberacao: unknown },
): Promise<{ url: string; nome: string } | null> {
  const liberacao = z.string().min(20).max(1000).safeParse(entrada.liberacao);
  const fotoId = z.uuid().safeParse(entrada.fotoId);
  if (!usuario || !liberacao.success || !fotoId.success) return null;
  const conta = await contaDoPainel(usuario);
  if (!conta || !liberacaoConfere(liberacao.data, usuario.id, LIBERACAO_VENDIDAS)) return null;
  const [item] = await loteVendidasDoAutor({
    fotografoId: conta.id,
    filtro: {},
    limite: 1,
    ids: [fotoId.data],
  });
  if (!item || item.eventoId !== entrada.eventoId || !/^https:\/\//.test(item.chave)) return null;
  return { url: item.chave, nome: nomeDaVendida(item) };
}

/**
 * Original no Drive para a rota do painel, pelo endereço de 15 minutos de `enderecoDoFluxo`:
 * confere a sessão, o token (deste usuário e desta foto, no prazo), que a conta de fotógrafo do
 * usuário é a autora da foto, que ela é do evento do endereço e que está no Drive. `null` em
 * qualquer recusa. As conferências do lote (dono do evento, liberação com a verificação em duas
 * etapas, limite) já foram feitas ao emitir o endereço.
 */
export async function originalEmFluxoParaOAutor(
  usuario: Usuario | null,
  entrada: { eventoId: string; fotoId: string; fluxo: unknown },
): Promise<{
  foto: OriginalDaFoto;
  nome: string;
  tipoMime: string;
  fotoId: string;
  eventoId: string;
} | null> {
  const fluxo = z.string().min(20).max(1000).safeParse(entrada.fluxo);
  const fotoId = z.uuid().safeParse(entrada.fotoId);
  if (!usuario || !fluxo.success || !fotoId.success) return null;
  const dados = conferirAssinatura(PROPOSITO_FLUXO, fluxo.data) as Partial<Fluxo> | null;
  if (dados?.u !== usuario.id || dados?.f !== fotoId.data) return null;
  const conta = await contaDoPainel(usuario);
  if (!conta) return null;
  const foto = await originalDoAutor(fotoId.data, conta.id);
  if (!foto || foto.eventoId !== entrada.eventoId) return null;
  if (foto.provedorOriginal !== "drive" || !foto.driveArquivoId) return null;
  return {
    foto: { chave: foto.chave, provedorOriginal: "drive", driveArquivoId: foto.driveArquivoId },
    nome: nomeDoOriginal(foto),
    tipoMime: tipoDoOriginal(foto.chave).mime,
    fotoId: foto.id,
    eventoId: foto.eventoId,
  };
}

export type ResultadoIndividual =
  | {
      ok: true;
      /** URL assinada de GET do R2 (~15 min), ou a imagem de exemplo fora da produção. */
      url: string;
      nome: string;
      /** Dado de exemplo: a rota entrega a imagem (o CSP não deixa buscar o host direto). */
      exemplo: boolean;
    }
  | { ok: false; motivo: "nao_encontrado" | "liberacao" | "limite" | "indisponivel" };

/**
 * Original de uma foto para o AUTOR dela (dono do evento ou colaborador), um por vez: confere a
 * sessão, que a conta de fotógrafo do usuário enviou a foto, a liberação do evento (verificação
 * em duas etapas) e o limite por usuário; registra na auditoria com o modo "individual". Foto de
 * outro autor, ainda em envio ou inexistente dá `nao_encontrado` (sem dizer qual).
 */
export async function originalIndividual(
  usuario: Usuario | null,
  entrada: { fotoId: unknown; liberacao: unknown },
  ip: string | null,
): Promise<ResultadoIndividual> {
  const fotoId = z.uuid().safeParse(entrada.fotoId);
  if (!usuario || !fotoId.success) return { ok: false, motivo: "nao_encontrado" };
  const conta = await contaDoPainel(usuario);
  if (!conta) return { ok: false, motivo: "nao_encontrado" };
  const foto = await originalDoAutor(fotoId.data, conta.id);
  if (!foto) return { ok: false, motivo: "nao_encontrado" };
  const liberacao = z.string().min(20).max(1000).safeParse(entrada.liberacao);
  if (!liberacao.success || !liberacaoConfere(liberacao.data, usuario.id, foto.eventoId)) {
    return { ok: false, motivo: "liberacao" };
  }
  if (await limiteAtingido("original_autor_usuario", usuario.id)) {
    return { ok: false, motivo: "limite" };
  }

  const nome = nomeDoOriginal(foto);
  let url: string | null = null;
  let exemplo = false;
  if (foto.chave.startsWith("originais/") && foto.provedorOriginal === "drive") {
    // A rota individual responde 302 (ou a URL em JSON) para o endereço do streaming.
    if (foto.driveArquivoId) url = enderecoDoFluxo(usuario.id, foto.eventoId, foto.id);
  } else if (foto.chave.startsWith("originais/")) {
    if (r2Configurado()) {
      url = await urlDeDownload(foto.chave, nome, tipoDoOriginal(foto.chave).mime);
    }
  } else if (/^https:\/\//.test(foto.chave) && !emProducao()) {
    url = foto.chave;
    exemplo = true;
  }
  if (!url) return { ok: false, motivo: "indisponivel" };

  await registrarLoteDoDono({
    eventoId: foto.eventoId,
    fotografoId: conta.id,
    usuarioId: usuario.id,
    modo: "individual",
    quantidade: 1,
    ip,
  });
  return { ok: true, url, nome, exemplo };
}
