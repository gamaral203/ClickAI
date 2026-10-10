// Relatório de um evento para o fotógrafo (página imprimível, salva em PDF pelo navegador).
// Como em ./painel.ts, recebe o id do fotógrafo logado e só lê o evento se for dele.

import "server-only";

import { eq, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { buscarEventoDoFotografo, type EventoDoPainel } from "./painel";
import {
  ganhosNoEvento,
  maisVendidasDoEscopo,
  metricasDoEvento,
  resumoDeVendas,
  type FotoMaisVendida,
  type VendasPorDia,
} from "./vendas-do-evento";

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
  /** Faturamento ÷ pedidos, arredondado para baixo; 0 sem pedidos. */
  ticketMedioCentavos: number;
  /** A parte do fotógrafo nas vendas do evento (bruta, antes dos saques). */
  parteDoFotografoCentavos: number;
  porMetodo: { pix: number; cartao: number };
  /** Vendas por dia, só os dias com venda, em ordem. */
  porDia: VendasPorDia[];
  maisVendidas: FotoMaisVendida[];
};

export async function relatorioDoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<RelatorioDoEvento | null> {
  await connection();
  const evento = await buscarEventoDoFotografo(eventoId, fotografoId);
  if (!evento) return null;
  const banco = await obterBanco();
  const escopo = { eventoId, autorId: null };

  const [[fotos], metricas, vendas, ganhos, maisVendidas] = await Promise.all([
    banco
      .select({
        publicadas: sql<number>`count(*) filter (where ${t.fotos.status} = 'pronta')::int`,
        comRosto: sql<number>`count(distinct ${t.rostos.fotoId})::int`,
      })
      .from(t.fotos)
      .leftJoin(t.rostos, eq(t.rostos.fotoId, t.fotos.id))
      .where(eq(t.fotos.eventoId, eventoId)),
    metricasDoEvento(eventoId),
    resumoDeVendas(escopo),
    ganhosNoEvento(eventoId, fotografoId),
    maisVendidasDoEscopo(escopo),
  ]);

  return {
    evento,
    geradoEm: new Date().toISOString(),
    fotosPublicadas: fotos?.publicadas ?? 0,
    fotosComRosto: fotos?.comRosto ?? 0,
    visitas: metricas.visitas,
    carrinhos: metricas.carrinhos,
    pedidos: vendas.pedidos,
    itensVendidos: vendas.itensVendidos,
    faturamentoCentavos: vendas.faturamentoCentavos,
    ticketMedioCentavos: vendas.ticketMedioCentavos,
    parteDoFotografoCentavos: ganhos.brutoCentavos,
    porMetodo: vendas.porMetodo,
    porDia: vendas.porDia,
    maisVendidas,
  };
}
