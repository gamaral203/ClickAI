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

export type PosicaoTopCliques = {
  fotografoId: string;
  nome: string;
  vendidas: number;
  /** O que os clientes pagaram pelas fotos dele neste evento (preço menos desconto). */
  faturadoCentavos: number;
};

/**
 * Classificação da equipe do evento (dono e colaboradores que aceitaram) pela quantidade de
 * fotos vendidas e pelo valor vendido. Só vendas válidas: pedido `pago` (estornado e contestado
 * não contam). Só a equipe do evento vê (painel do dono e Colaborações).
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
        faturado: sql<number>`coalesce(sum(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos}), 0)::int`,
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
      faturadoCentavos: vendas.find((v) => v.fotografoId === id)?.faturado ?? 0,
    }))
    .sort((a, b) => b.vendidas - a.vendidas || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------------------------------------------------------------- Metas

/**
 * Total vendido das fotos que o fotógrafo fez (como autor), em todos os eventos: o que os
 * clientes pagaram por elas, com desconto. Só pedidos pagos: estorno e chargeback saem da conta.
 * É a base das metas (src/lib/metas.ts).
 */
export async function totalVendidoComoAutor(fotografoId: string): Promise<number> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      total: sql<number>`coalesce(sum(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos}), 0)::int`,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .where(and(eq(t.itensPedido.fotografoId, fotografoId), eq(t.pedidos.status, "pago")));
  return linha?.total ?? 0;
}
