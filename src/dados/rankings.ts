// Top 10 eventos da semana (faixa "Em alta agora" da página inicial).

import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

/** Janela da classificação: os últimos 7 dias, contados a partir de agora. */
export const JANELA_TOP_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fotos vendidas por evento nos últimos 7 dias. Só vendas válidas: pedido `pago` (estornado e
 * contestado saem sozinhos da conta). Janela móvel em vez de semana de calendário, para a faixa
 * não ficar vazia na segunda de manhã. Devolve [eventoId, vendidas] do maior para o menor.
 */
export async function vendasDaSemanaPorEvento(): Promise<[string, number][]> {
  await connection();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ eventoId: t.fotos.eventoId, vendidas: sql<number>`count(*)::int` })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .where(
      and(
        eq(t.pedidos.status, "pago"),
        gte(t.pedidos.pagoEm, new Date(Date.now() - JANELA_TOP_SEMANA_MS)),
      ),
    )
    .groupBy(t.fotos.eventoId);
  return linhas
    .map((l) => [l.eventoId, l.vendidas] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}
