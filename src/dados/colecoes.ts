// Coleções de rostos arquivadas (src/servicos/colecoes.ts; docs/arquitetura.md, "Coleções
// arquivadas"): o evento parado tem a coleção do Rekognition apagada e os rostos tirados do banco,
// e volta a ser indexado quando alguém busca nele.

import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

/** A busca grava a hora no evento no máximo uma vez por este intervalo (menos escritas). */
const INTERVALO_DO_REGISTRO_MS = 6 * 60 * 60 * 1000;

/**
 * Última atividade do evento: a mais recente entre o fim (ou o início) do evento, a última busca
 * por rosto, o último item enviado e a última venda paga. Nomes escritos por extenso: dentro do
 * sql``, o Drizzle escreve a coluna sem a tabela, e nas subconsultas ela trocaria de tabela.
 */
const ULTIMA_ATIVIDADE = sql`greatest(
  coalesce("eventos"."fim_em", "eventos"."inicio_em"),
  coalesce("eventos"."ultima_busca_em", "eventos"."inicio_em"),
  coalesce((select max("f"."criado_em") from "fotos" "f" where "f"."evento_id" = "eventos"."id"), "eventos"."inicio_em"),
  coalesce((select max("p"."pago_em") from "pedidos" "p"
    join "itens_pedido" "i" on "i"."pedido_id" = "p"."id"
    join "fotos" "f" on "f"."id" = "i"."foto_id"
    where "f"."evento_id" = "eventos"."id"), "eventos"."inicio_em")
)`;

/** O evento tem rosto gravado (há coleção com rostos para apagar). */
const TEM_ROSTO_NO_EVENTO = sql`exists (select 1 from "fotos" "f" join "rostos" "r" on "r"."foto_id" = "f"."id" where "f"."evento_id" = "eventos"."id")`;

/**
 * Eventos com rostos indexados e sem atividade desde `limite` (o mais antigo primeiro), fora os
 * que estão sendo reindexados agora.
 */
export async function colecoesInativas(limite: Date, agora: Date, quantos: number) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(
      and(
        isNull(t.eventos.rostosArquivadosEm),
        or(isNull(t.eventos.reindexacaoAte), lt(t.eventos.reindexacaoAte, agora)),
        TEM_ROSTO_NO_EVENTO,
        sql`${ULTIMA_ATIVIDADE} < ${limite.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(t.eventos.inicioEm), asc(t.eventos.id))
    .limit(quantos);
  return linhas.map((l) => l.id);
}

/**
 * Depois de apagar a coleção no provedor: marca o evento como arquivado e tira os rostos do banco
 * (as fotos voltam a "não indexadas"), tudo junto. Rodar de novo não muda nada: a data do
 * primeiro arquivamento fica.
 */
export async function marcarColecaoArquivada(eventoId: string, agora: Date) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx
      .update(t.eventos)
      .set({
        rostosArquivadosEm: sql`coalesce(${t.eventos.rostosArquivadosEm}, ${agora.toISOString()}::timestamptz)`,
      })
      .where(eq(t.eventos.id, eventoId));
    const fotosDoEvento = tx
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(eq(t.fotos.eventoId, eventoId));
    await tx.delete(t.rostos).where(inArray(t.rostos.fotoId, fotosDoEvento));
    await tx.update(t.fotos).set({ rostosIndexadosEm: null }).where(eq(t.fotos.eventoId, eventoId));
  });
}

export type SituacaoDaColecao = {
  /** Quando a coleção foi arquivada; `null` se os rostos estão indexados normalmente. */
  arquivadaEm: Date | null;
  /** Quando alguém buscou no evento arquivado e a reindexação foi pedida. */
  reindexacaoPedidaEm: Date | null;
};

export async function situacaoDaColecao(eventoId: string): Promise<SituacaoDaColecao> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      arquivadaEm: t.eventos.rostosArquivadosEm,
      reindexacaoPedidaEm: t.eventos.reindexacaoPedidaEm,
    })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  return {
    arquivadaEm: linha?.arquivadaEm ?? null,
    reindexacaoPedidaEm: linha?.reindexacaoPedidaEm ?? null,
  };
}

/**
 * Registra a busca por rosto nos eventos (atividade que adia o arquivamento), no máximo uma vez a
 * cada INTERVALO_DO_REGISTRO_MS por evento.
 */
export async function registrarBuscaNosEventos(eventoIds: string[], agora: Date) {
  if (eventoIds.length === 0) return;
  const banco = await obterBanco();
  const antesDe = new Date(agora.getTime() - INTERVALO_DO_REGISTRO_MS);
  await banco
    .update(t.eventos)
    .set({ ultimaBuscaEm: agora })
    .where(
      and(
        inArray(t.eventos.id, eventoIds),
        or(isNull(t.eventos.ultimaBuscaEm), lt(t.eventos.ultimaBuscaEm, antesDe)),
      ),
    );
}

/** Alguém buscou no evento arquivado: pede a reindexação (a primeira data fica) e conta a busca. */
export async function pedirReindexacao(eventoId: string, agora: Date) {
  const banco = await obterBanco();
  await banco
    .update(t.eventos)
    .set({
      reindexacaoPedidaEm: sql`coalesce(${t.eventos.reindexacaoPedidaEm}, ${agora.toISOString()}::timestamptz)`,
      ultimaBuscaEm: agora,
    })
    .where(and(eq(t.eventos.id, eventoId), isNotNull(t.eventos.rostosArquivadosEm)));
}

/**
 * Reserva a reindexação do evento arquivado até `ate`, num UPDATE atômico: duas buscas (ou a
 * busca e o job) ao mesmo tempo não reindexam o mesmo evento duas vezes. `false` se o evento não
 * está arquivado ou outra reserva ainda vale.
 */
export async function reservarReindexacao(eventoId: string, agora: Date, ate: Date) {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.eventos)
    .set({ reindexacaoAte: ate })
    .where(
      and(
        eq(t.eventos.id, eventoId),
        isNotNull(t.eventos.rostosArquivadosEm),
        or(isNull(t.eventos.reindexacaoAte), lt(t.eventos.reindexacaoAte, agora)),
      ),
    )
    .returning({ id: t.eventos.id });
  return linhas.length > 0;
}

/** Solta a reserva sem concluir (o tempo acabou): a próxima busca ou o job continuam. */
export async function soltarReindexacao(eventoId: string) {
  const banco = await obterBanco();
  await banco.update(t.eventos).set({ reindexacaoAte: null }).where(eq(t.eventos.id, eventoId));
}

/** Todas as fotos do evento passaram pelo reconhecimento de novo: a busca volta ao normal. */
export async function concluirReindexacao(eventoId: string) {
  const banco = await obterBanco();
  await banco
    .update(t.eventos)
    .set({ rostosArquivadosEm: null, reindexacaoPedidaEm: null, reindexacaoAte: null })
    .where(eq(t.eventos.id, eventoId));
}

/** Eventos arquivados com reindexação pedida e sem reserva valendo, o pedido mais antigo antes. */
export async function reindexacoesPedidas(agora: Date, quantos: number) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(
      and(
        isNotNull(t.eventos.rostosArquivadosEm),
        isNotNull(t.eventos.reindexacaoPedidaEm),
        or(isNull(t.eventos.reindexacaoAte), lt(t.eventos.reindexacaoAte, agora)),
      ),
    )
    .orderBy(asc(t.eventos.reindexacaoPedidaEm))
    .limit(quantos);
  return linhas.map((l) => l.id);
}
