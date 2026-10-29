import "server-only";

import {
  armazenamentoAtual,
  buscarPedidoFinanceiro,
  lerCaixaAte,
  lerConfiguracoesGestao,
  listarAssinaturas,
  listarCobrancas,
  listarCobrancasEmAberto,
  listarPedidosFinanceiros,
  midiaDosEventos,
  type Assinatura,
  type CobrancaDespesa,
  type ConfiguracoesGestao,
  type PedidoFinanceiro,
} from "@/dados";
import {
  calcularIndicadores,
  conciliar,
  cobrancaVencida,
  converterParaReal,
  custoDaCobranca,
  decomporPedido,
  evolucaoMensal,
  ratear,
  resumirDespesas,
  resumirVendas,
  somarDias,
  ultimosMeses,
  type Conciliacao,
  type DecomposicaoPedido,
  type Indicadores,
  type PeriodoFinanceiro,
  type PontoMensal,
  type ResumoDespesas,
  type ResumoVendas,
  type TaxasDeReferencia,
} from "@/lib/financeiro-plataforma";
import {
  BYTES_ORIGINAL_ESTIMADO,
  BYTES_PREVIA_ESTIMADA,
  hojeEmBrasilia,
  valorMensal,
} from "@/lib/painel-de-uso";

import { exigirGestor } from "./sessao";

// Financeiro da ClicouAí (/admin/uso/financeiro): junta os dados do banco com as contas de
// src/lib/financeiro-plataforma.ts. Cada função confere o papel de gestor no servidor
// (exigirGestor) antes de ler qualquer número, além da checagem da página.

export const CAMINHO_FINANCEIRO = "/admin/uso/financeiro";

const GB = 1024 ** 3;

export type LinhaEvento = {
  eventoId: string;
  titulo: string;
  fotos: number;
  /** Bytes dos originais: medidos e, para os sem tamanho gravado, estimados. */
  bytes: number;
  bytesEstimados: boolean;
  itensVendidos: number;
  volumeCentavos: number;
  receitaBrutaCentavos: number;
  taxasCentavos: number;
  receitaLiquidaCentavos: number;
};

export type LinhaPedido = {
  id: string;
  pagoEm: string;
  metodo: "pix" | "cartao";
  status: string;
  d: DecomposicaoPedido;
};

export type PainelFinanceiro = {
  config: ConfiguracoesGestao;
  vendas: ResumoVendas;
  despesas: ResumoDespesas;
  /** Receita líquida − despesas pagas no período. */
  resultadoCentavos: number;
  evolucao: PontoMensal[];
  eventos: LinhaEvento[];
  pedidos: LinhaPedido[];
  conciliacao: Conciliacao;
  /** Acumulado até o dia do saldo (ou até agora): para a conciliação. */
  acumulado: { receitaLiquidaCentavos: number; despesasPagasCentavos: number };
  indicadores: Indicadores;
  custoFixoMensalCentavos: number | null;
  gbArmazenados: number;
};

/** Custo mensal estimado das despesas recorrentes ativas, em reais pela cotação de referência. */
export function custoMensalEstimado(
  assinaturas: Pick<Assinatura, "ativa" | "ciclo" | "valorCentavos" | "moeda" | "categoria">[],
  cotacaoDezMilesimos: number,
  filtro: (a: Pick<Assinatura, "categoria">) => boolean = () => true,
) {
  return assinaturas
    .filter((a) => a.ativa && filtro(a))
    .reduce((s, a) => {
      const mensal = valorMensal(a);
      return s + (a.moeda === "USD" ? converterParaReal(mensal, cotacaoDezMilesimos) : mensal);
    }, 0);
}

function decompor(p: PedidoFinanceiro, taxas: TaxasDeReferencia) {
  return decomporPedido(p, p.lancamentos, taxas);
}

/**
 * Tabela por evento: cada pedido é rateado entre os eventos dos itens dele, pelo valor de cada
 * item (preço − desconto), sem perder centavo. Custos compartilhados (hospedagem, e-mail...) não
 * são rateados aqui.
 */
export function porEvento(
  pedidos: { p: PedidoFinanceiro; d: DecomposicaoPedido }[],
): Omit<LinhaEvento, "fotos" | "bytes" | "bytesEstimados">[] {
  const mapa = new Map<string, Omit<LinhaEvento, "fotos" | "bytes" | "bytesEstimados">>();
  for (const { p, d } of pedidos) {
    if (d.situacao !== "receita" || p.itens.length === 0) continue;
    const pesos = p.itens.map((i) => i.valorCentavos);
    const volume = ratear(d.compradorPagouCentavos, pesos);
    const bruta = ratear(d.receitaBrutaCentavos, pesos);
    const taxas = ratear(d.taxaGatewayCentavos, pesos);
    const liquida = ratear(d.receitaLiquidaCentavos, pesos);
    p.itens.forEach((item, i) => {
      const linha = mapa.get(item.eventoId) ?? {
        eventoId: item.eventoId,
        titulo: item.eventoTitulo,
        itensVendidos: 0,
        volumeCentavos: 0,
        receitaBrutaCentavos: 0,
        taxasCentavos: 0,
        receitaLiquidaCentavos: 0,
      };
      linha.itensVendidos += 1;
      linha.volumeCentavos += volume[i];
      linha.receitaBrutaCentavos += bruta[i];
      linha.taxasCentavos += taxas[i];
      linha.receitaLiquidaCentavos += liquida[i];
      mapa.set(item.eventoId, linha);
    });
  }
  return [...mapa.values()].sort((a, b) => b.volumeCentavos - a.volumeCentavos);
}

/** Todos os números do painel para o período. Só gestor. */
export async function lerPainelFinanceiro(
  periodo: PeriodoFinanceiro,
  agora: number = Date.now(),
): Promise<PainelFinanceiro> {
  await exigirGestor(CAMINHO_FINANCEIRO);
  const config = await lerConfiguracoesGestao();
  const { taxas } = config;

  // Período.
  const doPeriodo = (
    await listarPedidosFinanceiros({ inicio: periodo.inicio, fim: periodo.fim })
  ).map((p) => ({ p, d: decompor(p, taxas) }));
  const vendas = resumirVendas(doPeriodo.map((x) => x.d));
  const cobrancasPeriodo = await listarCobrancas({
    diaInicio: periodo.diaInicio,
    diaFim: periodo.diaFim,
  });
  const despesas = resumirDespesas(cobrancasPeriodo);

  // Evolução dos últimos 12 meses.
  const meses = ultimosMeses(12, agora);
  const inicioEvolucao = `${meses[0]}-01T00:00:00-03:00`;
  const daEvolucao = (await listarPedidosFinanceiros({ inicio: inicioEvolucao })).map((p) => ({
    pagoEm: p.pagoEm,
    d: decompor(p, taxas),
  }));
  const cobrancasEvolucao = await listarCobrancas({ diaInicio: `${meses[0]}-01` });
  const evolucao = evolucaoMensal(meses, daEvolucao, cobrancasEvolucao);

  // Por evento.
  const linhas = porEvento(doPeriodo);
  const midia = new Map(
    (await midiaDosEventos(linhas.map((l) => l.eventoId))).map((m) => [m.eventoId, m]),
  );
  const eventos: LinhaEvento[] = linhas.map((l) => {
    const m = midia.get(l.eventoId);
    return {
      ...l,
      fotos: m?.fotos ?? 0,
      bytes: (m?.bytesMedidos ?? 0) + (m?.semTamanho ?? 0) * BYTES_ORIGINAL_ESTIMADO,
      bytesEstimados: (m?.semTamanho ?? 0) > 0,
    };
  });

  // Conciliação: até o fim do dia do saldo informado (ou até agora, sem saldo).
  const fimConciliacao = config.saldoMp
    ? `${somarDias(config.saldoMp.dia, 1)}T00:00:00-03:00`
    : new Date(agora).toISOString();
  const diaFimConciliacao = config.saldoMp
    ? somarDias(config.saldoMp.dia, 1)
    : somarDias(hojeEmBrasilia(agora), 1);
  const ateODia = (await listarPedidosFinanceiros({ fim: fimConciliacao })).map((p) =>
    decompor(p, taxas),
  );
  const vendasAte = resumirVendas(ateODia);
  const caixa = await lerCaixaAte(fimConciliacao);
  const cobrancasAte = await listarCobrancas({ diaFim: diaFimConciliacao });
  const custo = (c: { valorBrlCentavos: number; iofCentavos: number }) =>
    c.valorBrlCentavos + c.iofCentavos;
  const conciliacao = conciliar({
    saldoInformado: config.saldoMp
      ? { centavos: config.saldoMp.centavos, dia: config.saldoMp.dia }
      : null,
    entradasLiquidasCentavos: vendasAte.liquidoRecebidoCentavos,
    saquesPagosCentavos: caixa.saquesPagosCentavos,
    saquesProcessandoCentavos: caixa.saquesProcessandoCentavos,
    despesasPagasSaldoCentavos: cobrancasAte
      .filter((c) => c.status === "paga" && c.pagoPeloSaldoMp)
      .reduce((s, c) => s + custo(c), 0),
    despesasReservadasSaldoCentavos: cobrancasAte
      .filter((c) => c.status !== "paga" && c.pagoPeloSaldoMp)
      .reduce((s, c) => s + custo(c), 0),
    aSacarFotografosCentavos: caixa.aSacarFotografosCentavos,
  });

  // Indicadores.
  const assinaturas = await listarAssinaturas();
  const custoFixo = custoMensalEstimado(assinaturas, config.cotacaoDezMilesimos);
  const custoArmazenamento = custoMensalEstimado(
    assinaturas,
    config.cotacaoDezMilesimos,
    (a) => a.categoria === "armazenamento",
  );
  const arm = await armazenamentoAtual();
  const bytesTotais =
    arm.bytesMedidos + arm.semTamanho * BYTES_ORIGINAL_ESTIMADO + arm.itens * BYTES_PREVIA_ESTIMADA;
  const gbArmazenados = bytesTotais / GB;
  const indicadores = calcularIndicadores({
    receitaLiquidaCentavos: vendas.receitaLiquidaCentavos,
    eventosComVenda: eventos.length,
    custoFixoMensalCentavos: custoFixo > 0 ? custoFixo : null,
    custoArmazenamentoMensalCentavos: custoArmazenamento > 0 ? custoArmazenamento : null,
    gbArmazenadosX1000: Math.round(gbArmazenados * 1000),
  });

  return {
    config,
    vendas,
    despesas,
    resultadoCentavos: vendas.receitaLiquidaCentavos - despesas.pagasCentavos,
    evolucao,
    eventos,
    pedidos: doPeriodo.slice(0, 50).map(({ p, d }) => ({
      id: p.id,
      pagoEm: p.pagoEm,
      metodo: p.metodo,
      status: p.status,
      d,
    })),
    conciliacao,
    acumulado: {
      receitaLiquidaCentavos: vendasAte.receitaLiquidaCentavos,
      despesasPagasCentavos: cobrancasAte
        .filter((c) => c.status === "paga")
        .reduce((s, c) => s + custo(c), 0),
    },
    indicadores,
    custoFixoMensalCentavos: custoFixo > 0 ? custoFixo : null,
    gbArmazenados,
  };
}

export type ContasAPagar = {
  /** Pendentes, previstas e provisionadas, da data mais antiga à mais nova. */
  cobrancas: CobrancaDespesa[];
  /** Custo em reais (valor convertido + IOF) de todas. */
  totalCentavos: number;
  /** Pendentes e previstas com data anterior a hoje (Brasília). */
  vencidas: number;
  vencidasCentavos: number;
};

/** Contas a pagar: todas as cobranças não pagas, de todas as despesas. Só gestor. */
export async function lerContasAPagar(agora: number = Date.now()): Promise<ContasAPagar> {
  await exigirGestor(CAMINHO_FINANCEIRO);
  const cobrancas = await listarCobrancasEmAberto();
  const hoje = hojeEmBrasilia(agora);
  const vencidas = cobrancas.filter((c) => cobrancaVencida(c, hoje));
  const soma = (lista: CobrancaDespesa[]) => lista.reduce((s, c) => s + custoDaCobranca(c), 0);
  return {
    cobrancas,
    totalCentavos: soma(cobrancas),
    vencidas: vencidas.length,
    vencidasCentavos: soma(vencidas),
  };
}

/** Um pedido com a decomposição, para a tela do pedido. Só gestor; `null` se não existe. */
export async function lerDecomposicaoDoPedido(pedidoId: string) {
  await exigirGestor(CAMINHO_FINANCEIRO);
  const detalhe = await buscarPedidoFinanceiro(pedidoId);
  if (!detalhe) return null;
  const { taxas } = await lerConfiguracoesGestao();
  return {
    ...detalhe,
    taxas,
    decomposicao: decomporPedido(detalhe.pedido, detalhe.pedido.lancamentos, taxas),
  };
}
