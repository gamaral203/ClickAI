// Originais para o AUTOR baixar (src/servicos/originais-do-dono.ts). Regra: só quem enviou a
// foto (`fotos.enviada_por` = conta de fotógrafo do usuário) baixa o original dela, mesmo num
// evento colaborativo. Toda consulta prende `fotos.enviada_por` no WHERE, então foto de outro
// autor, de outro evento ou id trocado na requisição dá lista vazia (sem IDOR).
//
// Lotes do dono do evento (a consulta também confere `eventos.fotografo_id`):
//   - "vendidas": fotos que o próprio dono enviou e estão em pelo menos um pedido `pago`. As
//     vendas dos colaboradores ficam de fora (só o autor baixa). Pendente, expirado, cancelado,
//     estornado e contestado não contam. Foto excluída depois da venda continua;
//   - "minhas": tudo o que o próprio dono enviou ao evento e ficou pronto, inclusive o que ele
//     excluiu (vem marcado, para a tela avisar e separar numa pasta).
//
// Foto individual ("individual"): o autor, dono ou colaborador, baixa uma foto que ele enviou e
// ficou pronta (excluída também), em qualquer evento.

import "server-only";

import { and, asc, eq, exists, gt, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlDaPrevia } from "@/lib/url-publica";

/** Opção registrada na auditoria (inclui a foto individual). */
export type ModoOriginais = (typeof t.modoOriginaisDoDono.enumValues)[number];

/** Opções do download em lote do dono do evento (a aba Fotos vendidas tem o seu modo). */
export type ModoLoteOriginais = Exclude<ModoOriginais, "individual" | "vendidas_geral">;

export type EventoDoDono = { id: string; slug: string; titulo: string };

export type OriginalDoDono = {
  id: string;
  chave: string;
  nomeArquivo: string;
  tamanhoBytes: number | null;
  excluida: boolean;
};

export type ResumoOriginais = {
  quantidade: number;
  /** Soma dos tamanhos conhecidos (itens antigos ou de exemplo podem não ter). */
  bytes: number;
  /** Quantos estão excluídos (só na opção "minhas"). */
  excluidas: number;
};

/** Evento, se ele for deste fotógrafo (dono); senão `null`. */
export async function eventoDoDono(
  eventoId: string,
  fotografoId: string,
): Promise<EventoDoDono | null> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ id: t.eventos.id, slug: t.eventos.slug, titulo: t.eventos.titulo })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return evento ?? null;
}

/**
 * Condição do WHERE para o modo; sempre presa ao evento, ao dono e ao autor (o dono só baixa,
 * em qualquer opção, as fotos que ele mesmo enviou).
 */
function condicoes(eventoId: string, fotografoId: string, modo: ModoLoteOriginais): SQL {
  const base = and(
    eq(t.fotos.eventoId, eventoId),
    eq(t.eventos.fotografoId, fotografoId),
    eq(t.fotos.enviadaPor, fotografoId),
    isNotNull(t.fotos.chaveOriginal),
  )!;
  if (modo === "minhas") return and(base, eq(t.fotos.status, "pronta"))!;
  return base;
}

/** Subconsulta "o item está em algum pedido pago". */
async function vendidaEmPedidoPago() {
  const banco = await obterBanco();
  return exists(
    banco
      .select({ um: sql`1` })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .where(and(eq(t.itensPedido.fotoId, t.fotos.id), eq(t.pedidos.status, "pago"))),
  );
}

async function filtro(eventoId: string, fotografoId: string, modo: ModoLoteOriginais) {
  const onde = condicoes(eventoId, fotografoId, modo);
  return modo === "vendidas" ? and(onde, await vendidaEmPedidoPago())! : onde;
}

/** Quantidade, tamanho total e excluídas de cada opção, para a tela antes de baixar. */
export async function resumoOriginaisDoDono(
  eventoId: string,
  fotografoId: string,
  modo: ModoLoteOriginais,
): Promise<ResumoOriginais> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      quantidade: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}), 0)::bigint`,
      excluidas: sql<number>`count(${t.fotos.excluidaEm})::int`,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(await filtro(eventoId, fotografoId, modo));
  return {
    quantidade: Number(linha?.quantidade ?? 0),
    bytes: Number(linha?.bytes ?? 0),
    excluidas: modo === "minhas" ? Number(linha?.excluidas ?? 0) : 0,
  };
}

/**
 * Um lote de originais, em ordem de id (estável entre lotes): os que vêm depois de `depois`, ou
 * só os `ids` pedidos (para repetir falhas ou renovar URLs vencidas). Ids que não passam no
 * filtro do dono e do modo simplesmente não voltam.
 */
export async function loteOriginaisDoDono(opcoes: {
  eventoId: string;
  fotografoId: string;
  modo: ModoLoteOriginais;
  limite: number;
  depois?: string | null;
  ids?: string[];
}): Promise<OriginalDoDono[]> {
  const { eventoId, fotografoId, modo, limite, depois, ids } = opcoes;
  if (ids && ids.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.fotos.id,
      chave: t.fotos.chaveOriginal,
      nomeArquivo: t.fotos.nomeArquivo,
      tamanhoBytes: t.fotos.tamanhoBytes,
      excluidaEm: t.fotos.excluidaEm,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        await filtro(eventoId, fotografoId, modo),
        ids ? inArray(t.fotos.id, ids) : undefined,
        depois ? gt(t.fotos.id, depois) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
  return linhas.map((l) => ({
    id: l.id,
    chave: l.chave!,
    nomeArquivo: l.nomeArquivo,
    tamanhoBytes: l.tamanhoBytes,
    excluida: l.excluidaEm !== null,
  }));
}

/**
 * Original de uma foto, se este fotógrafo for o autor dela (quem a enviou) e ela estiver pronta
 * (excluída também vale); senão `null`. Não importa se ele é o dono do evento ou colaborador.
 */
export async function originalDoAutor(
  fotoId: string,
  fotografoId: string,
): Promise<(OriginalDoDono & { eventoId: string }) | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      id: t.fotos.id,
      eventoId: t.fotos.eventoId,
      chave: t.fotos.chaveOriginal,
      nomeArquivo: t.fotos.nomeArquivo,
      tamanhoBytes: t.fotos.tamanhoBytes,
      excluidaEm: t.fotos.excluidaEm,
    })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.id, fotoId),
        eq(t.fotos.enviadaPor, fotografoId),
        eq(t.fotos.status, "pronta"),
        isNotNull(t.fotos.chaveOriginal),
      ),
    );
  if (!linha) return null;
  return {
    id: linha.id,
    eventoId: linha.eventoId,
    chave: linha.chave!,
    nomeArquivo: linha.nomeArquivo,
    tamanhoBytes: linha.tamanhoBytes,
    excluida: linha.excluidaEm !== null,
  };
}

/** O fotógrafo enviou alguma foto a este evento (pode liberar o download das fotos dele). */
export async function autorNoEvento(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.fotos.id })
    .from(t.fotos)
    .where(and(eq(t.fotos.eventoId, eventoId), eq(t.fotos.enviadaPor, fotografoId)))
    .limit(1);
  return linha !== undefined;
}

/** Fotos prontas e não excluídas que o fotógrafo enviou ao evento (para a tela do colaborador). */
export async function fotosDoAutorNoEvento(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.fotos.id,
      nomeArquivo: t.fotos.nomeArquivo,
      urlMiniatura: t.fotos.urlMiniatura,
      urlPrevia: t.fotos.urlPrevia,
    })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        eq(t.fotos.enviadaPor, fotografoId),
        eq(t.fotos.status, "pronta"),
        isNull(t.fotos.excluidaEm),
        isNotNull(t.fotos.chaveOriginal),
      ),
    )
    .orderBy(asc(t.fotos.ordem));
  return linhas.map((l) => ({
    ...l,
    urlMiniatura: urlDaPrevia(l.urlMiniatura),
    urlPrevia: urlDaPrevia(l.urlPrevia),
  }));
}

/** Registra um lote (ou uma foto) entregue ao autor (auditoria): sem URLs nem chaves. */
export async function registrarLoteDoDono(registro: {
  eventoId: string;
  fotografoId: string;
  usuarioId: string;
  modo: ModoOriginais;
  quantidade: number;
  ip: string | null;
}) {
  const banco = await obterBanco();
  await banco.insert(t.downloadsDoDono).values(registro);
}

/** Lotes registrados de um evento, do mais novo ao mais antigo (para conferência e testes). */
export async function lotesDoDonoRegistrados(eventoId: string) {
  const banco = await obterBanco();
  return banco
    .select()
    .from(t.downloadsDoDono)
    .where(eq(t.downloadsDoDono.eventoId, eventoId))
    .orderBy(sql`${t.downloadsDoDono.criadoEm} desc`);
}
