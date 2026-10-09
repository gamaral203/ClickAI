// Nome público do autor de cada foto, para o crédito "Foto por …" (página da foto, carrinho,
// checkout e pedido). Só o nome e o endereço público, nunca dados da conta.

import "server-only";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type Autor = { nome: string; slug: string };

export async function autoresPorId(fotografoIds: string[]): Promise<Map<string, Autor>> {
  const ids = [...new Set(fotografoIds)];
  if (ids.length === 0) return new Map();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotografos.id, nome: t.fotografos.nomePublico, slug: t.fotografos.slug })
    .from(t.fotografos)
    .where(inArray(t.fotografos.id, ids));
  return new Map(linhas.map((l) => [l.id, { nome: l.nome, slug: l.slug }]));
}

// ---------------------------------------------------------------- Top Cliques

export type PosicaoTopCliques = { fotografoId: string; nome: string; vendidas: number };

/**
 * Classificação da equipe do evento (dono e colaboradores que aceitaram) pela quantidade de
 * fotos vendidas. Só vendas válidas: pedido `pago` (estornado e contestado não contam). Mostra só
 * a quantidade, nunca valores: quanto cada um recebe fica no Financeiro de cada um.
 */
export async function topCliquesDoEvento(eventoId: string): Promise<PosicaoTopCliques[]> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ dono: t.eventos.fotografoId })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  if (!evento) return [];
  const [equipe, vendas] = await Promise.all([
    banco
      .select({ id: t.colaboradores.fotografoId })
      .from(t.colaboradores)
      .where(and(eq(t.colaboradores.eventoId, eventoId), isNotNull(t.colaboradores.aceitoEm))),
    banco
      .select({
        fotografoId: t.itensPedido.fotografoId,
        vendidas: sql<number>`count(*)::int`,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(and(eq(t.pedidos.status, "pago"), eq(t.fotos.eventoId, eventoId)))
      .groupBy(t.itensPedido.fotografoId),
  ]);
  const ids = [evento.dono, ...equipe.map((e) => e.id), ...vendas.map((v) => v.fotografoId)];
  const nomes = await autoresPorId(ids);
  return [...new Set(ids)]
    .map((id) => ({
      fotografoId: id,
      nome: nomes.get(id)?.nome ?? "Fotógrafo",
      vendidas: vendas.find((v) => v.fotografoId === id)?.vendidas ?? 0,
    }))
    .sort((a, b) => b.vendidas - a.vendidas || a.nome.localeCompare(b.nome, "pt-BR"));
}
