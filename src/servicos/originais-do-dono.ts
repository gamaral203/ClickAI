import "server-only";

import { z } from "zod";

import {
  eventoDoDono,
  loteOriginaisDoDono,
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
import { DADOS_DO_FORMATO, formatoDaChave, nomeComExtensao } from "@/lib/tipos-imagem";

import { limiteAtingido } from "./limites";
import { exigirCodigoSeLigado, MENSAGENS_CODIGO } from "./mfa";
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
//     /api/painel/original/[fotoId], que responde 302 para a URL assinada.
// Outro fotógrafo, cliente e gestor não passam. O gestor usa o painel com a própria conta de
// fotógrafo (não é personificação): baixa só as fotos que essa conta enviou.
//
// Como: URLs assinadas de GET (~15 min, com Content-Disposition de anexo), direto do R2; os
// arquivos nunca passam pelo Next.js. Cada lote ou foto conta num limite por usuário e fica
// registrado em `downloads_do_dono` (quem, evento, opção, quantos, IP; sem URLs). Com a
// verificação em duas etapas ligada, o código é pedido uma vez por evento, e a liberação (token
// assinado, preso ao usuário e ao evento) vale por 3 horas, para os lotes e as fotos individuais.

export const ORIGINAIS_POR_LOTE = 50;
export const VALIDADE_LIBERACAO_MS = 3 * 60 * 60 * 1000;
const PROPOSITO = "originais-do-dono";

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
  const resultado = await exigirCodigoSeLigado(usuario, codigo);
  if (resultado !== "ok") {
    return { ok: false, erro: MENSAGENS_CODIGO[resultado], pedeCodigo: true };
  }
  const dados: Liberacao = { u: usuario.id, e: eventoId };
  return { ok: true, liberacao: assinar(PROPOSITO, dados, VALIDADE_LIBERACAO_MS) };
}

function liberacaoConfere(token: string, usuarioId: string, eventoId: string) {
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
  const formato = formatoDaChave(item.chave) ?? "jpeg";
  const completo = nomeComExtensao(item.nomeArquivo, formato);
  const ext = DADOS_DO_FORMATO[formato].extensao;
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
  contexto: { eventoId: string; modo: ModoLoteOriginais; liberacao: string },
) {
  if (item.chave.startsWith("originais/")) {
    if (!r2Configurado()) return null;
    const formato = formatoDaChave(item.chave) ?? "jpeg";
    return urlDeDownload(item.chave, nome, DADOS_DO_FORMATO[formato].mime);
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
    const url = await enderecoDoOriginal(item, nome, { eventoId, modo, liberacao });
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
  if (foto.chave.startsWith("originais/")) {
    if (r2Configurado()) {
      const formato = formatoDaChave(foto.chave) ?? "jpeg";
      url = await urlDeDownload(foto.chave, nome, DADOS_DO_FORMATO[formato].mime);
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
