// Rankings públicos da página inicial: eventos que mais venderam na semana ("Eventos em
// destaque") e fotógrafos que mais venderam como autores ("Fotógrafos em destaque").

import "server-only";

import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import type { Fotografo } from "./tipos";

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
        // Vendas fictícias da conta de demonstração não entram em ranking nenhum.
        eq(t.pedidos.demonstracao, false),
        gte(t.pedidos.pagoEm, new Date(Date.now() - JANELA_TOP_SEMANA_MS)),
      ),
    )
    .groupBy(t.fotos.eventoId);
  return linhas
    .map((l) => [l.eventoId, l.vendidas] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Fotos e vídeos vendidos por AUTOR, em qualquer evento (dono ou colaborador): cada item conta
 * para `itens_pedido.fotografo_id`, que é o `fotos.enviada_por` gravado na venda e quem recebe o
 * lançamento do autor (o mesmo critério do Top Cliques). Só pedido `pago`: estornado e contestado
 * ficam de fora. Uma consulta agregada; devolve [fotografoId, vendidas] do maior para o menor.
 * A contagem só ordena o ranking: a página nunca mostra o número.
 */
export async function vendasPorAutor(): Promise<[string, number][]> {
  await connection();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ fotografoId: t.itensPedido.fotografoId, vendidas: sql<number>`count(*)::int` })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .where(and(eq(t.pedidos.status, "pago"), eq(t.pedidos.demonstracao, false)))
    .groupBy(t.itensPedido.fotografoId);
  return linhas
    .map((l) => [l.fotografoId, l.vendidas] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Colaboradores com convite aceito dos eventos dados (o dono já vem no próprio evento), com o
 * perfil público: só nome, endereço, foto/avatar, bio, capa e redes; nunca dados da conta.
 */
export async function colaboradoresDosEventos(
  eventoIds: string[],
): Promise<{ eventoId: string; fotografo: Fotografo }[]> {
  if (eventoIds.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      eventoId: t.colaboradores.eventoId,
      id: t.fotografos.id,
      nomePublico: t.fotografos.nomePublico,
      slug: t.fotografos.slug,
      bio: t.fotografos.bio,
      fotoPerfil: t.fotografos.fotoPerfil,
      avatar: t.fotografos.avatar,
      capa: t.fotografos.capa,
      redesSociais: t.fotografos.redesSociais,
    })
    .from(t.colaboradores)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.colaboradores.fotografoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.colaboradores.eventoId))
    .where(
      and(
        inArray(t.colaboradores.eventoId, eventoIds),
        isNotNull(t.colaboradores.aceitoEm),
        ne(t.eventos.fotografoId, t.colaboradores.fotografoId),
      ),
    );
  return linhas.map(({ eventoId, ...fotografo }) => ({ eventoId, fotografo }));
}
