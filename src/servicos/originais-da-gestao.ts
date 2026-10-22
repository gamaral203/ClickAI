import "server-only";

import { z } from "zod";

import {
  eventoExisteParaAGestao,
  loteOriginaisDaGestao,
  originalParaAGestao,
  pastasDoEvento,
  registrarDownloadDaGestao,
  type FiltroFotosDaGestao,
  type OriginalDaGestao,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { tipoDoOriginal } from "@/lib/arquivo-original";
import { r2Configurado, urlDeDownload } from "@/lib/r2";

import { exigirCodigoDeAcao, MENSAGENS_CODIGO_ACAO } from "./codigo-acao";
import { limiteAtingido } from "./limites";
import { nomeDoOriginal, ORIGINAIS_POR_LOTE, type ItemParaBaixar } from "./originais-do-dono";

// Download dos originais pela GESTÃO (docs/CLAUDE.md, segunda exceção à regra "nenhum original
// sem pedido pago"; docs/arquitetura.md, "Originais pela gestão").
//
// Regra: a conta com papel de gestor (`usuarios.papel = 'admin'`) baixa o original de qualquer
// foto ou vídeo pronto de qualquer evento, para suporte e operação, pela área de gestão
// (/admin/eventos). Proteções, todas no servidor e a cada pedido:
//   - o papel é lido do banco a cada chamada (a sessão relê o usuário); fotógrafo, cliente e
//     visitante recebem "não encontrado", sem dizer se a foto existe;
//   - com a verificação em duas etapas ligada, o código enviado ao e-mail libera por 3 horas (token
//     assinado com propósito próprio, preso ao gestor; não vale como liberação do dono, nem a do
//     dono vale aqui);
//   - limites por gestor: `original_gestao_usuario` (300 originais individuais por hora) e
//     `originais_gestao_usuario` (120 lotes de até 50 em 10 minutos, como o dono);
//   - auditoria de cada entrega em `downloads_da_gestao` (gestor, evento, foto ou lote,
//     quantidade, IP), nunca com a URL ou a chave;
//   - URLs assinadas de GET de ~15 min, direto do R2 (anexo): o arquivo nunca passa pelo Next.js.
// Os ids chegam validados como UUID (Zod) e as consultas conferem que existem.

export const VALIDADE_LIBERACAO_GESTAO_MS = 3 * 60 * 60 * 1000;
const PROPOSITO = "originais-da-gestao";
/** Marcador da liberação: o modo próprio da gestão (por gestor, vale para todos os eventos). */
const MODO = "gestao";

type Liberacao = { u: string; m: typeof MODO };

const ERROS = {
  nao_encontrado: "Evento não encontrado.",
  liberacao: "A liberação do download venceu. Libere de novo para continuar.",
  limite: "Muitos lotes seguidos. Espere um minuto: o download continua sozinho.",
  invalido: "Pedido inválido.",
} as const;

export type ResultadoLoteDaGestao =
  | { ok: true; itens: ItemParaBaixar[]; proximo: string | null; indisponiveis: string[] }
  | { ok: false; motivo: "nao_encontrado" | "liberacao" | "limite" | "invalido"; erro: string };

/** O usuário é gestor (papel lido do banco pela sessão). */
export function ehGestor(usuario: Usuario | null): usuario is Usuario {
  return usuario?.papel === "admin";
}

// ---------------------------------------------------------------- Filtro e nomes

export const filtroFotosDaGestao = z
  .object({
    pastaId: z.union([z.uuid(), z.literal("sem")]).nullish(),
    autorId: z.uuid().nullish(),
    excluidas: z.boolean().default(false),
  })
  .strict();

/** Lê o filtro (endereço da página ou pedido do navegador); inválido vira vazio. */
export function lerFiltroFotosDaGestao(entrada: unknown): FiltroFotosDaGestao {
  const lido = filtroFotosDaGestao.safeParse(entrada);
  return lido.success ? lido.data : { excluidas: false };
}

/** Um pedaço do caminho no disco: sem acento, barra, ponto no começo nem caractere estranho. */
export function segmentoDoCaminho(texto: string, reserva: string) {
  const limpo = texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 60);
  return limpo || reserva;
}

type PastaSimples = { id: string; nome: string; pastaPaiId: string | null };

/**
 * Caminho do arquivo na pasta ou no ZIP: `evento-slug/[excluidas/]pasta/subpasta/nome_id8.ext`.
 * As excluídas ficam numa pasta `excluidas` logo abaixo da do evento.
 */
export function caminhoNaGestao(item: OriginalDaGestao, pastas: Map<string, PastaSimples>) {
  const partes = [segmentoDoCaminho(item.eventoSlug, "evento")];
  if (item.excluida) partes.push("excluidas");
  const pasta = item.pastaId ? pastas.get(item.pastaId) : undefined;
  if (pasta) {
    const pai = pasta.pastaPaiId ? pastas.get(pasta.pastaPaiId) : undefined;
    if (pai) partes.push(segmentoDoCaminho(pai.nome, "pasta"));
    partes.push(segmentoDoCaminho(pasta.nome, "pasta"));
  }
  partes.push(nomeDoOriginal(item));
  return partes.join("/");
}

// ---------------------------------------------------------------- Liberação

/**
 * Libera o download de originais pela gestão por 3 horas: só gestor; pede o código enviado ao
 * e-mail se a verificação em duas etapas estiver ligada.
 */
export async function liberarOriginaisDaGestao(
  usuario: Usuario | null,
  codigo: unknown,
): Promise<{ ok: true; liberacao: string } | { ok: false; erro: string; pedeCodigo?: boolean }> {
  if (!ehGestor(usuario)) return { ok: false, erro: ERROS.nao_encontrado };
  const resultado = await exigirCodigoDeAcao(usuario, "gestao_originais", codigo);
  if (resultado !== "ok") {
    return { ok: false, erro: MENSAGENS_CODIGO_ACAO[resultado], pedeCodigo: true };
  }
  const dados: Liberacao = { u: usuario.id, m: MODO };
  return { ok: true, liberacao: assinar(PROPOSITO, dados, VALIDADE_LIBERACAO_GESTAO_MS) };
}

/** A liberação (token de 3 h) é da gestão e deste gestor. */
export function liberacaoDaGestaoConfere(token: unknown, usuarioId: string) {
  const texto = z.string().min(20).max(1000).safeParse(token);
  if (!texto.success) return false;
  const dados = conferirAssinatura(PROPOSITO, texto.data) as Partial<Liberacao> | null;
  return dados?.u === usuarioId && dados?.m === MODO;
}

// ---------------------------------------------------------------- Lote

const pedidoDeLote = z
  .object({
    eventoId: z.uuid(),
    filtro: filtroFotosDaGestao.default({ excluidas: false }),
    liberacao: z.string().min(20).max(1000),
    depois: z.uuid().nullish(),
    ids: z.array(z.uuid()).min(1).max(ORIGINAIS_POR_LOTE).optional(),
  })
  .strict();

/**
 * Próximo lote de URLs assinadas para a gestão (até 50) de um evento: depois do id `depois`, ou
 * só os `ids` pedidos (as selecionadas, repetir falhas, renovar URL vencida). Confere o papel, o
 * evento, a liberação e o limite; registra o lote na auditoria.
 */
export async function loteDeOriginaisDaGestao(
  usuario: Usuario | null,
  entrada: unknown,
  ip: string | null,
): Promise<ResultadoLoteDaGestao> {
  const pedido = pedidoDeLote.safeParse(entrada);
  if (!pedido.success) return { ok: false, motivo: "invalido", erro: ERROS.invalido };
  const { eventoId, filtro, liberacao, depois, ids } = pedido.data;
  if (!ehGestor(usuario) || !(await eventoExisteParaAGestao(eventoId))) {
    return { ok: false, motivo: "nao_encontrado", erro: ERROS.nao_encontrado };
  }
  if (!liberacaoDaGestaoConfere(liberacao, usuario.id)) {
    return { ok: false, motivo: "liberacao", erro: ERROS.liberacao };
  }
  if (await limiteAtingido("originais_gestao_usuario", usuario.id)) {
    return { ok: false, motivo: "limite", erro: ERROS.limite };
  }

  const [linhas, pastas] = await Promise.all([
    loteOriginaisDaGestao({
      eventoId,
      filtro,
      limite: ORIGINAIS_POR_LOTE,
      depois: ids ? null : depois,
      ids,
    }),
    pastasDoEvento(eventoId),
  ]);
  const porId = new Map(pastas.map((p) => [p.id, p]));
  const itens: ItemParaBaixar[] = [];
  const indisponiveis: string[] = [];
  for (const item of linhas) {
    const url = await enderecoNoLote(item, liberacao);
    if (!url) {
      indisponiveis.push(item.id);
      continue;
    }
    // O caminho já separa as excluídas (`evento/excluidas/...`): `excluida` fica falso para o
    // navegador não pôr outra pasta por cima.
    itens.push({
      id: item.id,
      nome: caminhoNaGestao(item, porId),
      url,
      bytes: item.tamanhoBytes,
      excluida: false,
    });
  }
  if (itens.length > 0) {
    await registrarDownloadDaGestao({
      gestorId: usuario.id,
      eventoId,
      modo: "lote",
      quantidade: itens.length,
      ip,
    });
  }
  const fim = ids || linhas.length < ORIGINAIS_POR_LOTE;
  return { ok: true, itens, proximo: fim ? null : linhas[linhas.length - 1].id, indisponiveis };
}

/** Endereço do original no lote, ou `null` se ele não está disponível neste ambiente. */
async function enderecoNoLote(item: OriginalDaGestao, liberacao: string) {
  if (item.chave.startsWith("originais/")) {
    if (!r2Configurado()) return null;
    return urlDeDownload(item.chave, nomeDoOriginal(item), tipoDoOriginal(item.chave).mime);
  }
  // Dados de exemplo (só fora da produção): a rota da gestão confere tudo de novo e entrega a
  // imagem (o CSP não deixa o navegador buscar outro host direto).
  if (/^https:\/\//.test(item.chave) && !emProducao()) {
    return `/api/gestao/originais/${item.id}?${new URLSearchParams({ liberacao })}`;
  }
  return null;
}

// ---------------------------------------------------------------- Foto individual

export type ResultadoIndividualDaGestao =
  | { ok: true; url: string; nome: string; exemplo: boolean }
  | { ok: false; motivo: "nao_encontrado" | "liberacao" | "limite" | "indisponivel" };

/**
 * Original de uma foto para o gestor, um por vez: confere o papel, que a foto existe e está
 * pronta (excluída também vale), a liberação da gestão e o limite por gestor; registra na
 * auditoria com o modo "individual" e a foto.
 */
export async function originalIndividualDaGestao(
  usuario: Usuario | null,
  entrada: { fotoId: unknown; liberacao: unknown },
  ip: string | null,
): Promise<ResultadoIndividualDaGestao> {
  const fotoId = z.uuid().safeParse(entrada.fotoId);
  if (!ehGestor(usuario) || !fotoId.success) return { ok: false, motivo: "nao_encontrado" };
  const foto = await originalParaAGestao(fotoId.data);
  if (!foto) return { ok: false, motivo: "nao_encontrado" };
  if (!liberacaoDaGestaoConfere(entrada.liberacao, usuario.id)) {
    return { ok: false, motivo: "liberacao" };
  }
  if (await limiteAtingido("original_gestao_usuario", usuario.id)) {
    return { ok: false, motivo: "limite" };
  }

  const nome = nomeDoOriginal(foto);
  let url: string | null = null;
  let exemplo = false;
  if (foto.chave.startsWith("originais/")) {
    if (r2Configurado())
      url = await urlDeDownload(foto.chave, nome, tipoDoOriginal(foto.chave).mime);
  } else if (/^https:\/\//.test(foto.chave) && !emProducao()) {
    url = foto.chave;
    exemplo = true;
  }
  if (!url) return { ok: false, motivo: "indisponivel" };

  await registrarDownloadDaGestao({
    gestorId: usuario.id,
    eventoId: foto.eventoId,
    fotoId: foto.id,
    modo: "individual",
    quantidade: 1,
    ip,
  });
  return { ok: true, url, nome, exemplo };
}

/**
 * Um original de exemplo (fora da produção) pedido por um lote da gestão: confere o papel e a
 * liberação de novo. Não registra (o lote que entregou o endereço já foi registrado).
 */
export async function originalDeExemploParaAGestao(
  usuario: Usuario | null,
  entrada: { fotoId: unknown; liberacao: unknown },
): Promise<{ url: string; nome: string } | null> {
  if (emProducao()) return null;
  const fotoId = z.uuid().safeParse(entrada.fotoId);
  if (!ehGestor(usuario) || !fotoId.success) return null;
  if (!liberacaoDaGestaoConfere(entrada.liberacao, usuario.id)) return null;
  const foto = await originalParaAGestao(fotoId.data);
  if (!foto || !/^https:\/\//.test(foto.chave)) return null;
  return { url: foto.chave, nome: nomeDoOriginal(foto) };
}
