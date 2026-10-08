// Relatório de um evento para o fotógrafo (página imprimível, salva em PDF pelo navegador).
// Como em ./painel.ts, recebe o id do fotógrafo logado e só lê o evento se for dele.

import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

import { buscarEventoDoFotografo, type EventoDoPainel } from "./painel";

export type RelatorioDoEvento = {
  evento: EventoDoPainel;
  geradoEm: string;
  fotosPublicadas: number;
  fotosComRosto: number;
  visitas: number;
  carrinhos: number;
  pedidos: number;
  itensVendidos: number;
  /** O que os clientes pagaram pelos itens do evento (com desconto). */
  faturamentoCentavos: number;
  /** A parte do fotógrafo nas vendas do evento (bruta, antes dos saques). */
  parteDoFotografoCentavos: number;
  porMetodo: { pix: number; cartao: number };
  /** Vendas por dia, só os dias com venda, em ordem. */
  porDia: { dia: string; pedidos: number; valorCentavos: number }[];
  maisVendidas: { fotoId: string; urlMiniatura: string; nomeArquivo: string; vendas: number }[];
};

/** "2026-10-07" no horário de Brasília. */
function diaEmBrasilia(instante: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(instante);
}

export async function relatorioDoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<RelatorioDoEvento | null> {
  await connection();
  const evento = await buscarEventoDoFotografo(eventoId, fotografoId);
  if (!evento) return null;
  const banco = await obterBanco();
  const pago = and(eq(t.pedidos.status, "pago"), eq(t.fotos.eventoId, eventoId));

  const [[fotos], [metricas], itens, [parte], maisVendidas] = await Promise.all([
    banco
      .select({
        publicadas: sql<number>`count(*) filter (where ${t.fotos.status} = 'pronta')::int`,
        comRosto: sql<number>`count(distinct ${t.rostos.fotoId})::int`,
      })
      .from(t.fotos)
      .leftJoin(t.rostos, eq(t.rostos.fotoId, t.fotos.id))
      .where(eq(t.fotos.eventoId, eventoId)),
    banco
      .select({
        visitas: sql<number>`count(*) filter (where ${t.metricas.tipo} = 'visita_evento')::int`,
        carrinhos: sql<number>`count(*) filter (where ${t.metricas.tipo} = 'carrinho')::int`,
      })
      .from(t.metricas)
      .where(eq(t.metricas.eventoId, eventoId)),
    banco
      .select({
        pedidoId: t.pedidos.id,
        metodo: t.pedidos.metodo,
        pagoEm: t.pedidos.pagoEm,
        valorCentavos: sql<number>`(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos})::int`,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(pago),
    banco
      .select({ total: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}), 0)::int` })
      .from(t.lancamentos)
      .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(and(eq(t.lancamentos.fotografoId, fotografoId), eq(t.fotos.eventoId, eventoId))),
    banco
      .select({
        fotoId: t.fotos.id,
        urlMiniatura: t.fotos.urlMiniatura,
        nomeArquivo: t.fotos.nomeArquivo,
        vendas: sql<number>`count(*)::int`,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(pago)
      .groupBy(t.fotos.id, t.fotos.urlMiniatura, t.fotos.nomeArquivo)
      .orderBy(sql`count(*) desc`)
      .limit(6),
  ]);

  const pedidos = new Map<string, { metodo: string; dia: string; valorCentavos: number }>();
  for (const item of itens) {
    const pedido = pedidos.get(item.pedidoId) ?? {
      metodo: item.metodo,
      dia: item.pagoEm ? diaEmBrasilia(item.pagoEm) : "",
      valorCentavos: 0,
    };
    pedido.valorCentavos += item.valorCentavos;
    pedidos.set(item.pedidoId, pedido);
  }
  const porDia = new Map<string, { dia: string; pedidos: number; valorCentavos: number }>();
  for (const p of pedidos.values()) {
    const linha = porDia.get(p.dia) ?? { dia: p.dia, pedidos: 0, valorCentavos: 0 };
    linha.pedidos++;
    linha.valorCentavos += p.valorCentavos;
    porDia.set(p.dia, linha);
  }
  const lista = [...pedidos.values()];

  return {
    evento,
    geradoEm: new Date().toISOString(),
    fotosPublicadas: fotos?.publicadas ?? 0,
    fotosComRosto: fotos?.comRosto ?? 0,
    visitas: metricas?.visitas ?? 0,
    carrinhos: metricas?.carrinhos ?? 0,
    pedidos: pedidos.size,
    itensVendidos: itens.length,
    faturamentoCentavos: lista.reduce((s, p) => s + p.valorCentavos, 0),
    parteDoFotografoCentavos: parte?.total ?? 0,
    porMetodo: {
      pix: lista.filter((p) => p.metodo === "pix").length,
      cartao: lista.filter((p) => p.metodo === "cartao").length,
    },
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    maisVendidas: maisVendidas.map((f) => ({ ...f, urlMiniatura: urlPublica(f.urlMiniatura) })),
  };
}
