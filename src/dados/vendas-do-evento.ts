// Contas de venda de um evento, usadas pelo relatório (./relatorio.ts) e pela tela de desempenho
// (./desempenho-evento.ts). Não checam quem pede: quem chama confere antes se a pessoa é dona ou
// colaboradora do evento. Por isso este arquivo não sai por ./index.ts.
//
// O escopo é o evento inteiro (dono) ou só os itens de um autor (colaborador): `autorId` filtra
// por `itens_pedido.fotografo_id`, que é quem recebe pela foto. Só pedido `pago` conta como
// venda (estornado e contestado ficam de fora). Foto excluída depois da venda continua contando.

import "server-only";

import { and, eq, sql, type SQL } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

import { iso } from "./mapas";

const DIA_MS = 24 * 60 * 60 * 1000;

/** "2026-10-07" no horário de Brasília. */
export function diaEmBrasilia(instante: Date | number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(instante);
}

export type EscopoDeVendas = {
  eventoId: string;
  /** Só os itens deste autor; `null` para o evento inteiro. */
  autorId: string | null;
};

export type VendasPorDia = { dia: string; pedidos: number; valorCentavos: number };

export type ResumoDeVendas = {
  /** Pedidos pagos com pelo menos um item do escopo. */
  pedidos: number;
  itensVendidos: number;
  /** Fotos distintas vendidas (uma foto comprada por duas pessoas conta uma vez). */
  fotosVendidas: number;
  /** O que os clientes pagaram pelos itens do escopo (preço menos desconto). */
  faturamentoCentavos: number;
  /** Faturamento ÷ pedidos, arredondado para baixo; 0 sem pedidos. */
  ticketMedioCentavos: number;
  /** A maior soma dos itens do escopo dentro de um mesmo pedido. */
  maiorPedidoCentavos: number;
  /** Quando foi paga a venda mais recente (ISO), ou `null` sem vendas. */
  ultimaVendaEm: string | null;
  porMetodo: { pix: number; cartao: number };
  /** Só os dias com venda, em ordem. */
  porDia: VendasPorDia[];
};

function pagoNoEscopo({ eventoId, autorId }: EscopoDeVendas): SQL | undefined {
  return and(
    eq(t.pedidos.status, "pago"),
    eq(t.fotos.eventoId, eventoId),
    autorId ? eq(t.itensPedido.fotografoId, autorId) : undefined,
  );
}

export async function resumoDeVendas(escopo: EscopoDeVendas): Promise<ResumoDeVendas> {
  const banco = await obterBanco();
  const itens = await banco
    .select({
      pedidoId: t.pedidos.id,
      metodo: t.pedidos.metodo,
      pagoEm: t.pedidos.pagoEm,
      fotoId: t.itensPedido.fotoId,
      valorCentavos: sql<number>`(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos})::int`,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .where(pagoNoEscopo(escopo));

  const pedidos = new Map<
    string,
    { metodo: string; pagoEm: Date | null; dia: string; valorCentavos: number }
  >();
  for (const item of itens) {
    const pedido = pedidos.get(item.pedidoId) ?? {
      metodo: item.metodo,
      pagoEm: item.pagoEm,
      dia: item.pagoEm ? diaEmBrasilia(item.pagoEm) : "",
      valorCentavos: 0,
    };
    pedido.valorCentavos += item.valorCentavos;
    pedidos.set(item.pedidoId, pedido);
  }
  const lista = [...pedidos.values()];
  const porDia = new Map<string, VendasPorDia>();
  for (const p of lista) {
    const linha = porDia.get(p.dia) ?? { dia: p.dia, pedidos: 0, valorCentavos: 0 };
    linha.pedidos++;
    linha.valorCentavos += p.valorCentavos;
    porDia.set(p.dia, linha);
  }
  const faturamentoCentavos = lista.reduce((s, p) => s + p.valorCentavos, 0);
  const ultima = lista.reduce<Date | null>(
    (maior, p) => (p.pagoEm && (!maior || p.pagoEm > maior) ? p.pagoEm : maior),
    null,
  );

  return {
    pedidos: lista.length,
    itensVendidos: itens.length,
    fotosVendidas: new Set(itens.map((i) => i.fotoId)).size,
    faturamentoCentavos,
    ticketMedioCentavos: lista.length ? Math.floor(faturamentoCentavos / lista.length) : 0,
    maiorPedidoCentavos: lista.reduce((maior, p) => Math.max(maior, p.valorCentavos), 0),
    ultimaVendaEm: iso(ultima),
    porMetodo: {
      pix: lista.filter((p) => p.metodo === "pix").length,
      cartao: lista.filter((p) => p.metodo === "cartao").length,
    },
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

export type FotoMaisVendida = {
  fotoId: string;
  urlMiniatura: string;
  nomeArquivo: string;
  vendas: number;
};

/** As fotos do escopo que mais venderam, da que mais vendeu para a que menos vendeu. */
export async function maisVendidasDoEscopo(
  escopo: EscopoDeVendas,
  limite = 6,
): Promise<FotoMaisVendida[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      fotoId: t.fotos.id,
      urlMiniatura: t.fotos.urlMiniatura,
      nomeArquivo: t.fotos.nomeArquivo,
      vendas: sql<number>`count(*)::int`,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .where(pagoNoEscopo(escopo))
    .groupBy(t.fotos.id, t.fotos.urlMiniatura, t.fotos.nomeArquivo)
    .orderBy(sql`count(*) desc`)
    .limit(limite);
  return linhas.map((f) => ({ ...f, urlMiniatura: urlPublica(f.urlMiniatura) }));
}

/** Visitas e adições ao carrinho do evento inteiro (não identificam ninguém nem são dinheiro). */
export async function metricasDoEvento(eventoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      visitas: sql<number>`count(*) filter (where ${t.metricas.tipo} = 'visita_evento')::int`,
      carrinhos: sql<number>`count(*) filter (where ${t.metricas.tipo} = 'carrinho')::int`,
    })
    .from(t.metricas)
    .where(eq(t.metricas.eventoId, eventoId));
  return { visitas: linha?.visitas ?? 0, carrinhos: linha?.carrinhos ?? 0 };
}

export type GanhosNoEvento = {
  /** Pelas fotos de que ele é autor. */
  vendasPropriasCentavos: number;
  /** A comissão que ele recebe, como dono, sobre as fotos dos colaboradores. */
  comissaoComoDonoCentavos: number;
  /** Os dois juntos: tudo o que entrou na conta dele por este evento. */
  brutoCentavos: number;
};

/**
 * O que entrou na conta do fotógrafo por este evento, lido dos `lancamentos` (a fonte da
 * verdade do saldo): os estornos entram com valor negativo, então o resultado já vem líquido
 * deles. O lançamento é "venda própria" quando o item é dele e "comissão como dono" quando o
 * item é de um colaborador (src/servicos/pedidos.ts, lancamentosDaVenda).
 */
export async function ganhosNoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<GanhosNoEvento> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      proprias: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}) filter (where ${t.itensPedido.fotografoId} = ${t.lancamentos.fotografoId}), 0)::int`,
      comissao: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}) filter (where ${t.itensPedido.fotografoId} <> ${t.lancamentos.fotografoId}), 0)::int`,
    })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .where(and(eq(t.lancamentos.fotografoId, fotografoId), eq(t.fotos.eventoId, eventoId)));
  const proprias = linha?.proprias ?? 0;
  const comissao = linha?.comissao ?? 0;
  return {
    vendasPropriasCentavos: proprias,
    comissaoComoDonoCentavos: comissao,
    brutoCentavos: proprias + comissao,
  };
}

/**
 * Série contínua de dias para o gráfico, do dia da primeira venda até hoje, com zero nos dias
 * sem venda. Tem pelo menos 7 dias (o gráfico fica legível) e no máximo `maxDias` (os mais
 * recentes).
 */
export function serieAteHoje(porDia: VendasPorDia[], agora: number, maxDias = 60): VendasPorDia[] {
  const primeiro = porDia[0]?.dia;
  const dias: string[] = [];
  for (let i = 0; i < maxDias; i++) {
    const dia = diaEmBrasilia(agora - i * DIA_MS);
    dias.unshift(dia);
    if (i >= 6 && (!primeiro || dia <= primeiro)) break;
  }
  const vendas = new Map(porDia.map((d) => [d.dia, d]));
  return dias.map((dia) => vendas.get(dia) ?? { dia, pedidos: 0, valorCentavos: 0 });
}
