// Contas do Financeiro da ClicouAí (/admin/uso/financeiro), sem banco: decomposição de cada
// pedido (o que o comprador pagou, a parte dos fotógrafos, a comissão, a taxa do Mercado Pago e o
// que sobra para a plataforma), o período do filtro no horário de Brasília, a conversão do dólar
// pela cotação gravada, o resumo das despesas e a conciliação com o saldo informado à mão.
//
// Regras:
//   - dinheiro em centavos inteiros; taxas e cotações em inteiros (pontos-base, dez-milésimos).
//     Toda divisão arredonda de forma explícita (`dividirArredondando`: meio centavo para longe
//     do zero), e nenhuma conta passa por número quebrado;
//   - faturamento (volume bruto) ≠ receita (comissão) ≠ resultado (receita líquida − despesas)
//     ≠ caixa (saldo da conta do Mercado Pago);
//   - a comissão já cobrada vale pelo valor gravado no saque (`saques.comissao_centavos`, que
//     guarda os 10% do começo e os 8% de hoje); só a do saldo ainda sem saque é estimada com o %
//     atual da conta, e aparece separada ("a realizar");
//   - pedido pendente, expirado ou cancelado nunca é receita; estornado e contestado ficam à
//     parte (o dinheiro voltou ou está em disputa).

import { z } from "zod";

import { comissaoDe } from "@/servicos/financeiro";

import { reaisParaCentavos } from "./dinheiro";

// ---------------------------------------------------------------- Inteiros

/** a ÷ b arredondado, com o meio para longe do zero (b > 0). Só inteiros. */
export function dividirArredondando(a: number, b: number) {
  if (b <= 0) throw new Error("divisor precisa ser positivo");
  const sinal = a < 0 ? -1 : 1;
  return sinal * Math.floor((Math.abs(a) * 2 + b) / (2 * b));
}

/** Valor × pontos-base (99 = 0,99%), arredondado. */
export function aplicarPb(valorCentavos: number, pontosBase: number) {
  return dividirArredondando(valorCentavos * pontosBase, 10_000);
}

/**
 * Divide `total` entre partes proporcionais a `pesos`, sem perder centavo: cada parte recebe o
 * piso e os centavos que sobram vão, um a um, para as maiores sobras (a primeira em caso de
 * empate). Soma das partes = total. Pesos zerados (ou todos zero) recebem por igual.
 */
export function ratear(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const somaPesos = pesos.reduce((s, p) => s + Math.max(0, p), 0);
  const base = somaPesos > 0 ? pesos.map((p) => Math.max(0, p)) : pesos.map(() => 1);
  const soma = somaPesos > 0 ? somaPesos : pesos.length;
  const sinal = total < 0 ? -1 : 1;
  const absoluto = Math.abs(total);
  const partes = base.map((p) => Math.floor((absoluto * p) / soma));
  let resto = absoluto - partes.reduce((s, p) => s + p, 0);
  const ordem = base
    .map((p, i) => ({ i, sobra: (absoluto * p) % soma }))
    .sort((a, b) => b.sobra - a.sobra || a.i - b.i);
  for (const { i } of ordem) {
    if (resto <= 0) break;
    partes[i] += 1;
    resto -= 1;
  }
  return partes.map((p) => p * sinal);
}

// ---------------------------------------------------------------- Taxas de referência

/** Taxas do Mercado Pago no Checkout (recebimento na hora): Pix 0,99%, cartão 4,98%. */
export const TAXA_PIX_PB_PADRAO = 99;
export const TAXA_CARTAO_PB_PADRAO = 498;
/** Cotação de referência inicial: US$ 1 = R$ 5,3495 (dez-milésimos de real). */
export const COTACAO_PADRAO_DEZ_MILESIMOS = 53_495;

export type TaxasDeReferencia = { pixPb: number; cartaoPb: number };

export type Metodo = "pix" | "cartao";

/** Taxa estimada do Mercado Pago sobre o total pago, pela taxa de referência do método. */
export function taxaEstimada(totalCentavos: number, metodo: Metodo, taxas: TaxasDeReferencia) {
  if (totalCentavos <= 0) return 0;
  return aplicarPb(totalCentavos, metodo === "pix" ? taxas.pixPb : taxas.cartaoPb);
}

/** "0,99%" a partir de pontos-base. */
export function textoPb(pontosBase: number) {
  const inteiro = Math.floor(pontosBase / 100);
  const resto = String(pontosBase % 100).padStart(2, "0");
  return `${inteiro},${resto}%`;
}

/** "0,99" ou "4,98" → pontos-base; aceita até 2 casas. `null` se inválido ou fora de 0–20%. */
export function lerPercentualPb(texto: string): number | null {
  const m = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(texto.trim().replace("%", "").trim());
  if (!m) return null;
  const pb = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return pb <= 2000 ? pb : null;
}

// ---------------------------------------------------------------- Câmbio

/** Centavos de dólar → centavos de real pela cotação em dez-milésimos (53495 = R$ 5,3495). */
export function converterParaReal(centavosUsd: number, cotacaoDezMilesimos: number) {
  return dividirArredondando(centavosUsd * cotacaoDezMilesimos, 10_000);
}

/** "5,3495" → 53495 (até 4 casas). `null` se inválido ou fora de R$ 1–50. */
export function lerCotacao(texto: string): number | null {
  const m = /^(\d{1,2})(?:[.,](\d{1,4}))?$/.exec(texto.trim());
  if (!m) return null;
  const valor = Number(m[1]) * 10_000 + Number((m[2] ?? "0").padEnd(4, "0"));
  return valor >= 10_000 && valor <= 500_000 ? valor : null;
}

/** 53495 → "5,3495". */
export function textoCotacao(dezMilesimos: number) {
  return `${Math.floor(dezMilesimos / 10_000)},${String(dezMilesimos % 10_000).padStart(4, "0")}`;
}

// ---------------------------------------------------------------- Decomposição do pedido

export type StatusPedido =
  "pendente" | "pago" | "expirado" | "cancelado" | "estornado" | "contestado";

export type SaqueDoLancamento = {
  status: "processando" | "pago" | "falhou";
  brutoCentavos: number;
  comissaoCentavos: number;
  taxaAntecipacaoCentavos: number;
};

export type LancamentoParaDecomposicao = {
  /** Valor no razão do fotógrafo (negativo no estorno). */
  valorCentavos: number;
  /** Saque que levou o lançamento (`null` se ainda não sacado). */
  saque: SaqueDoLancamento | null;
  /** % de comissão atual da conta do fotógrafo: só para estimar o que ainda não foi sacado. */
  comissaoPctAtual: number;
};

export type PedidoParaDecomposicao = {
  status: StatusPedido;
  metodo: Metodo;
  totalCentavos: number;
  acrescimoCartaoCentavos: number;
  taxaGatewayCentavos: number | null;
  liquidoRecebidoCentavos: number | null;
  taxaGatewayOrigem: "mp" | "estimada" | null;
};

/**
 * De onde veio a taxa: `mp` (lida no pagamento), `estimada` (gravada na confirmação pela taxa de
 * referência, porque o Mercado Pago não informou) ou `estimada_na_leitura` (pedido anterior à
 * migração 0048, sem nada gravado: estimada agora, sem gravar).
 */
export type OrigemTaxa = "mp" | "estimada" | "estimada_na_leitura";

export type SituacaoFinanceira = "receita" | "sem_receita" | "estornado" | "contestado";

export type DecomposicaoPedido = {
  situacao: SituacaoFinanceira;
  /** Total que o comprador pagou (no pendente, o que pagaria). */
  compradorPagouCentavos: number;
  /** Soma dos lançamentos dos fotógrafos (no cartão, já sem a metade da taxa que cabe a eles). */
  parteFotografosCentavos: number;
  /** Comissão já cobrada em saque (valor gravado no saque, rateado pelo valor do lançamento). */
  comissaoRealizadaCentavos: number;
  /** Comissão do que ainda não foi sacado, pelo % atual da conta: estimativa. */
  comissaoARealizarCentavos: number;
  /** Taxa de antecipação do cartão cobrada nos saques (receita da plataforma). */
  taxaAntecipacaoCentavos: number;
  /** Comissão realizada + a realizar + antecipação. */
  receitaBrutaCentavos: number;
  /** O que já foi pago aos fotógrafos (saques pagos), líquido de comissão e antecipação. */
  repasseSacadoCentavos: number;
  /** O que ainda é deles: sem saque ou em saque em processamento. */
  repasseASacarCentavos: number;
  /** Taxa do Mercado Pago (real ou estimada: ver `taxaOrigem`). */
  taxaGatewayCentavos: number;
  taxaOrigem: OrigemTaxa;
  /** Parte da taxa paga pelo comprador (acréscimo) e pelo fotógrafo (metade) no cartão; 0 no Pix. */
  coberturaDaTaxaCentavos: number;
  /** Taxa que sai da plataforma: taxa − cobertura (negativa = sobrou centavo do arredondamento). */
  taxaAbsorvidaCentavos: number;
  /** Receita bruta − taxa absorvida: o que fica com a plataforma. */
  receitaLiquidaCentavos: number;
  /** Total − taxa: o que caiu na conta do Mercado Pago. */
  liquidoRecebidoCentavos: number;
  /** Sem lançamentos (pedido pago sem razão): a parte dos fotógrafos foi deduzida do total. */
  semLancamentos: boolean;
};

const ZERO = {
  parteFotografosCentavos: 0,
  comissaoRealizadaCentavos: 0,
  comissaoARealizarCentavos: 0,
  taxaAntecipacaoCentavos: 0,
  receitaBrutaCentavos: 0,
  repasseSacadoCentavos: 0,
  repasseASacarCentavos: 0,
  taxaGatewayCentavos: 0,
  coberturaDaTaxaCentavos: 0,
  taxaAbsorvidaCentavos: 0,
  receitaLiquidaCentavos: 0,
  liquidoRecebidoCentavos: 0,
};

/** A taxa do pedido: a gravada (real ou estimada na confirmação) ou estimada agora. */
export function taxaDoPedido(
  p: Pick<
    PedidoParaDecomposicao,
    "taxaGatewayCentavos" | "taxaGatewayOrigem" | "totalCentavos" | "metodo"
  >,
  taxas: TaxasDeReferencia,
): { centavos: number; origem: OrigemTaxa } {
  if (p.taxaGatewayCentavos !== null && p.taxaGatewayOrigem) {
    return { centavos: p.taxaGatewayCentavos, origem: p.taxaGatewayOrigem };
  }
  return {
    centavos: taxaEstimada(p.totalCentavos, p.metodo, taxas),
    origem: "estimada_na_leitura",
  };
}

/**
 * Decompõe um pedido. Só o `pago` gera receita; os outros devolvem tudo zerado, com a situação
 * (o total aparece como referência). A comissão de cada lançamento já sacado é a parte dele na
 * comissão gravada no saque (comissão × valor ÷ bruto do saque, arredondada); a dos não sacados
 * usa a mesma conta do saque (`comissaoDe`, para baixo) com o % atual.
 */
export function decomporPedido(
  pedido: PedidoParaDecomposicao,
  lancamentos: LancamentoParaDecomposicao[],
  taxas: TaxasDeReferencia,
): DecomposicaoPedido {
  const taxa = taxaDoPedido(pedido, taxas);
  const base = {
    compradorPagouCentavos: pedido.totalCentavos,
    taxaOrigem: taxa.origem,
    semLancamentos: false,
  };
  if (pedido.status !== "pago") {
    const situacao: SituacaoFinanceira =
      pedido.status === "estornado"
        ? "estornado"
        : pedido.status === "contestado"
          ? "contestado"
          : "sem_receita";
    return { ...ZERO, ...base, situacao };
  }

  let parte = 0;
  let realizada = 0;
  let aRealizar = 0;
  let antecipacao = 0;
  let sacado = 0;
  for (const l of lancamentos) {
    parte += l.valorCentavos;
    const s = l.saque && l.saque.status !== "falhou" && l.saque.brutoCentavos > 0 ? l.saque : null;
    if (s) {
      const comissao = dividirArredondando(l.valorCentavos * s.comissaoCentavos, s.brutoCentavos);
      const antec = dividirArredondando(
        l.valorCentavos * s.taxaAntecipacaoCentavos,
        s.brutoCentavos,
      );
      realizada += comissao;
      antecipacao += antec;
      if (s.status === "pago") sacado += l.valorCentavos - comissao - antec;
    } else {
      aRealizar += comissaoDe(l.valorCentavos, l.comissaoPctAtual);
    }
  }
  const semLancamentos = lancamentos.length === 0;
  // Sem razão (não deveria acontecer num pedido pago): a parte deles é o total menos o
  // acréscimo do cartão, e a comissão fica zerada (nada a cobrar de quem não tem lançamento).
  if (semLancamentos) parte = pedido.totalCentavos - pedido.acrescimoCartaoCentavos;

  const receitaBruta = realizada + aRealizar + antecipacao;
  const cobertura = pedido.totalCentavos - parte;
  const absorvida = taxa.centavos - cobertura;
  return {
    situacao: "receita",
    ...base,
    semLancamentos,
    parteFotografosCentavos: parte,
    comissaoRealizadaCentavos: realizada,
    comissaoARealizarCentavos: aRealizar,
    taxaAntecipacaoCentavos: antecipacao,
    receitaBrutaCentavos: receitaBruta,
    repasseSacadoCentavos: sacado,
    repasseASacarCentavos: parte - receitaBruta - sacado,
    taxaGatewayCentavos: taxa.centavos,
    coberturaDaTaxaCentavos: cobertura,
    taxaAbsorvidaCentavos: absorvida,
    receitaLiquidaCentavos: receitaBruta - absorvida,
    liquidoRecebidoCentavos:
      pedido.taxaGatewayOrigem === "mp" && pedido.liquidoRecebidoCentavos !== null
        ? pedido.liquidoRecebidoCentavos
        : pedido.totalCentavos - taxa.centavos,
  };
}

// ---------------------------------------------------------------- Resumo do período

export type ResumoVendas = {
  pedidosPagos: number;
  volumeBrutoCentavos: number;
  parteFotografosCentavos: number;
  repasseSacadoCentavos: number;
  repasseASacarCentavos: number;
  comissaoRealizadaCentavos: number;
  comissaoARealizarCentavos: number;
  taxaAntecipacaoCentavos: number;
  receitaBrutaCentavos: number;
  taxaGatewayCentavos: number;
  /** Quantos pedidos tiveram a taxa lida no Mercado Pago, e quantos estimada. */
  taxasReais: number;
  taxasEstimadas: number;
  taxaAbsorvidaCentavos: number;
  receitaLiquidaCentavos: number;
  liquidoRecebidoCentavos: number;
  /** À parte: não são receita. */
  estornados: { pedidos: number; centavos: number };
  contestados: { pedidos: number; centavos: number };
};

export function resumirVendas(decomposicoes: DecomposicaoPedido[]): ResumoVendas {
  const r: ResumoVendas = {
    pedidosPagos: 0,
    volumeBrutoCentavos: 0,
    parteFotografosCentavos: 0,
    repasseSacadoCentavos: 0,
    repasseASacarCentavos: 0,
    comissaoRealizadaCentavos: 0,
    comissaoARealizarCentavos: 0,
    taxaAntecipacaoCentavos: 0,
    receitaBrutaCentavos: 0,
    taxaGatewayCentavos: 0,
    taxasReais: 0,
    taxasEstimadas: 0,
    taxaAbsorvidaCentavos: 0,
    receitaLiquidaCentavos: 0,
    liquidoRecebidoCentavos: 0,
    estornados: { pedidos: 0, centavos: 0 },
    contestados: { pedidos: 0, centavos: 0 },
  };
  for (const d of decomposicoes) {
    if (d.situacao === "estornado" || d.situacao === "contestado") {
      const alvo = d.situacao === "estornado" ? r.estornados : r.contestados;
      alvo.pedidos += 1;
      alvo.centavos += d.compradorPagouCentavos;
      continue;
    }
    if (d.situacao !== "receita") continue;
    r.pedidosPagos += 1;
    r.volumeBrutoCentavos += d.compradorPagouCentavos;
    r.parteFotografosCentavos += d.parteFotografosCentavos;
    r.repasseSacadoCentavos += d.repasseSacadoCentavos;
    r.repasseASacarCentavos += d.repasseASacarCentavos;
    r.comissaoRealizadaCentavos += d.comissaoRealizadaCentavos;
    r.comissaoARealizarCentavos += d.comissaoARealizarCentavos;
    r.taxaAntecipacaoCentavos += d.taxaAntecipacaoCentavos;
    r.receitaBrutaCentavos += d.receitaBrutaCentavos;
    r.taxaGatewayCentavos += d.taxaGatewayCentavos;
    if (d.taxaOrigem === "mp") r.taxasReais += 1;
    else r.taxasEstimadas += 1;
    r.taxaAbsorvidaCentavos += d.taxaAbsorvidaCentavos;
    r.receitaLiquidaCentavos += d.receitaLiquidaCentavos;
    r.liquidoRecebidoCentavos += d.liquidoRecebidoCentavos;
  }
  return r;
}

// ---------------------------------------------------------------- Despesas

export type StatusCobranca = "paga" | "pendente" | "prevista" | "provisionada";

export const ROTULO_STATUS_COBRANCA: Record<StatusCobranca, string> = {
  paga: "Paga",
  pendente: "Pendente",
  prevista: "Prevista",
  provisionada: "Provisionada",
};

export type CobrancaParaResumo = {
  data: string;
  status: StatusCobranca;
  valorBrlCentavos: number;
  iofCentavos: number;
  categoria: string;
  pagoPeloSaldoMp: boolean;
};

/** Custo em reais de uma cobrança: valor convertido mais IOF/câmbio. */
export const custoDaCobranca = (c: Pick<CobrancaParaResumo, "valorBrlCentavos" | "iofCentavos">) =>
  c.valorBrlCentavos + c.iofCentavos;

export type ResumoDespesas = {
  /** Só o que saiu de fato. */
  pagasCentavos: number;
  /** Reservas: nunca somadas ao pago. */
  pendentesCentavos: number;
  previstasCentavos: number;
  provisionadasCentavos: number;
  /** Pagas, por categoria (maior primeiro). */
  porCategoria: { categoria: string; centavos: number }[];
};

export function resumirDespesas(cobrancas: CobrancaParaResumo[]): ResumoDespesas {
  const soma = (s: StatusCobranca) =>
    cobrancas.filter((c) => c.status === s).reduce((t, c) => t + custoDaCobranca(c), 0);
  const categorias = new Map<string, number>();
  for (const c of cobrancas) {
    if (c.status !== "paga") continue;
    categorias.set(c.categoria, (categorias.get(c.categoria) ?? 0) + custoDaCobranca(c));
  }
  return {
    pagasCentavos: soma("paga"),
    pendentesCentavos: soma("pendente"),
    previstasCentavos: soma("prevista"),
    provisionadasCentavos: soma("provisionada"),
    porCategoria: [...categorias]
      .map(([categoria, centavos]) => ({ categoria, centavos }))
      .sort((a, b) => b.centavos - a.centavos),
  };
}

/**
 * Valores de uma cobrança a partir do formulário: em reais, o convertido é o próprio valor (sem
 * cotação); em dólar, convertido pela cotação informada (a efetivamente usada, que fica gravada).
 */
export function valoresDaCobranca(
  valorCentavos: number,
  moeda: "BRL" | "USD",
  cotacaoDezMilesimos: number | null,
): { cotacaoDezMilesimos: number | null; valorBrlCentavos: number } | null {
  if (moeda === "BRL") return { cotacaoDezMilesimos: null, valorBrlCentavos: valorCentavos };
  if (!cotacaoDezMilesimos) return null;
  return {
    cotacaoDezMilesimos,
    valorBrlCentavos: converterParaReal(valorCentavos, cotacaoDezMilesimos),
  };
}

// ---------------------------------------------------------------- Conciliação

export type EntradaConciliacao = {
  saldoInformado: { centavos: number; dia: string } | null;
  /** Pedidos pagos até o dia: total − taxa (o que caiu na conta). */
  entradasLiquidasCentavos: number;
  /** Saques pagos até o dia (líquido enviado). */
  saquesPagosCentavos: number;
  /** Saques em processamento: podem ter saído ou não. */
  saquesProcessandoCentavos: number;
  /** Cobranças pagas com o saldo do Mercado Pago até o dia. */
  despesasPagasSaldoCentavos: number;
  /** Pendentes, previstas e provisionadas marcadas para o saldo do Mercado Pago (só referência). */
  despesasReservadasSaldoCentavos: number;
  /** Parte dos fotógrafos ainda na conta (a sacar, sem os saques em processamento). */
  aSacarFotografosCentavos: number;
};

export type Conciliacao = EntradaConciliacao & {
  /** Entradas − saques (pagos e em processamento) − despesas pagas pelo saldo. */
  saldoCalculadoCentavos: number;
  /** Do saldo calculado, o que é da plataforma (sem o dinheiro dos fotógrafos). */
  saldoDaPlataformaCentavos: number;
  /** Saldo calculado menos as reservas (nunca misturado com o pago). */
  saldoAposReservasCentavos: number;
  /** Informado − calculado; `null` sem saldo informado. */
  diferencaCentavos: number | null;
};

export function conciliar(e: EntradaConciliacao): Conciliacao {
  const saldoCalculadoCentavos =
    e.entradasLiquidasCentavos -
    e.saquesPagosCentavos -
    e.saquesProcessandoCentavos -
    e.despesasPagasSaldoCentavos;
  return {
    ...e,
    saldoCalculadoCentavos,
    saldoDaPlataformaCentavos: saldoCalculadoCentavos - e.aSacarFotografosCentavos,
    saldoAposReservasCentavos: saldoCalculadoCentavos - e.despesasReservadasSaldoCentavos,
    diferencaCentavos: e.saldoInformado ? e.saldoInformado.centavos - saldoCalculadoCentavos : null,
  };
}

// ---------------------------------------------------------------- Período (Brasília)

export const PERIODOS = ["hoje", "7d", "mes", "mes_anterior", "ano", "personalizado"] as const;
export type TipoPeriodo = (typeof PERIODOS)[number];

export const ROTULO_PERIODO: Record<TipoPeriodo, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  mes: "Mês atual",
  mes_anterior: "Mês anterior",
  ano: "Ano atual",
  personalizado: "Personalizado",
};

const FUSO = "America/Sao_Paulo";

function diaEmBrasilia(instante: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(instante));
}

/** "AAAA-MM-DD" válido (data que existe). */
export function diaValido(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

/** Soma dias a um "AAAA-MM-DD", sem passar pelo fuso do servidor. */
export function somarDias(dia: string, dias: number) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Mês de um instante em Brasília: "AAAA-MM". */
export function mesEmBrasilia(instanteIso: string) {
  return diaEmBrasilia(new Date(instanteIso).getTime()).slice(0, 7);
}

export type PeriodoFinanceiro = {
  tipo: TipoPeriodo;
  /** Primeiro dia (inclusivo) e o dia seguinte ao último (exclusivo), "AAAA-MM-DD". */
  diaInicio: string;
  diaFim: string;
  /** Instantes ISO no horário de Brasília (fim exclusivo). */
  inicio: string;
  fim: string;
  rotulo: string;
  /** O personalizado veio inválido e caiu no mês atual. */
  invalido: boolean;
};

/** Teto do personalizado: 3 anos. */
const DIAS_MAXIMOS = 3 * 366;

function formatarDiaCurto(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Período do filtro em Brasília (o Brasil não tem horário de verão desde 2019: -03:00 o ano
 * todo). "7 dias" é hoje e os 6 anteriores; "personalizado" usa `de` e `ate` inclusivos.
 */
export function periodoFinanceiro(
  tipo: TipoPeriodo,
  agora: number = Date.now(),
  de?: string,
  ate?: string,
): PeriodoFinanceiro {
  const hoje = diaEmBrasilia(agora);
  const [ano, mes] = hoje.split("-").map(Number);
  const primeiroDoMes = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}-01`;
  const montar = (t: TipoPeriodo, ini: string, fimExclusivo: string, invalido = false) => {
    const ultimo = somarDias(fimExclusivo, -1);
    const rotulo =
      ini === ultimo
        ? formatarDiaCurto(ini)
        : `${formatarDiaCurto(ini)} a ${formatarDiaCurto(ultimo)}`;
    return {
      tipo: t,
      diaInicio: ini,
      diaFim: fimExclusivo,
      inicio: `${ini}T00:00:00-03:00`,
      fim: `${fimExclusivo}T00:00:00-03:00`,
      rotulo,
      invalido,
    };
  };
  const amanha = somarDias(hoje, 1);
  switch (tipo) {
    case "hoje":
      return montar("hoje", hoje, amanha);
    case "7d":
      return montar("7d", somarDias(hoje, -6), amanha);
    case "mes_anterior": {
      const inicio = mes === 1 ? primeiroDoMes(ano - 1, 12) : primeiroDoMes(ano, mes - 1);
      return montar("mes_anterior", inicio, primeiroDoMes(ano, mes));
    }
    case "ano":
      return montar("ano", primeiroDoMes(ano, 1), amanha);
    case "personalizado": {
      const ok =
        de &&
        ate &&
        diaValido(de) &&
        diaValido(ate) &&
        de <= ate &&
        somarDias(de, DIAS_MAXIMOS) >= ate;
      if (ok) return montar("personalizado", de, somarDias(ate, 1));
      return montar("mes", primeiroDoMes(ano, mes), amanha, true);
    }
    case "mes":
    default:
      return montar("mes", primeiroDoMes(ano, mes), amanha);
  }
}

/** Os últimos `n` meses até o de `agora` (Brasília), do mais antigo ao atual: "AAAA-MM". */
export function ultimosMeses(n: number, agora: number = Date.now()) {
  const [ano, mes] = diaEmBrasilia(agora).split("-").map(Number);
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = ano * 12 + (mes - 1) - i;
    meses.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return meses;
}

// ---------------------------------------------------------------- Evolução mensal

export type PontoMensal = {
  mes: string;
  volumeCentavos: number;
  receitaBrutaCentavos: number;
  taxasCentavos: number;
  receitaLiquidaCentavos: number;
  despesasCentavos: number;
  /** Receita líquida − despesas pagas. */
  resultadoCentavos: number;
};

/** Agrupa por mês (Brasília) os pedidos (pelo pagamento) e as cobranças pagas (pela data). */
export function evolucaoMensal(
  meses: string[],
  pedidos: { pagoEm: string; d: DecomposicaoPedido }[],
  cobrancas: CobrancaParaResumo[],
): PontoMensal[] {
  const mapa = new Map<string, PontoMensal>(
    meses.map((mes) => [
      mes,
      {
        mes,
        volumeCentavos: 0,
        receitaBrutaCentavos: 0,
        taxasCentavos: 0,
        receitaLiquidaCentavos: 0,
        despesasCentavos: 0,
        resultadoCentavos: 0,
      },
    ]),
  );
  for (const { pagoEm, d } of pedidos) {
    if (d.situacao !== "receita") continue;
    const p = mapa.get(mesEmBrasilia(pagoEm));
    if (!p) continue;
    p.volumeCentavos += d.compradorPagouCentavos;
    p.receitaBrutaCentavos += d.receitaBrutaCentavos;
    p.taxasCentavos += d.taxaGatewayCentavos;
    p.receitaLiquidaCentavos += d.receitaLiquidaCentavos;
  }
  for (const c of cobrancas) {
    if (c.status !== "paga") continue;
    const p = mapa.get(c.data.slice(0, 7));
    if (p) p.despesasCentavos += custoDaCobranca(c);
  }
  for (const p of mapa.values())
    p.resultadoCentavos = p.receitaLiquidaCentavos - p.despesasCentavos;
  return [...mapa.values()];
}

// ---------------------------------------------------------------- Indicadores

/** Mínimo de eventos com venda para a conta "eventos para cobrir os custos" fazer sentido. */
export const EVENTOS_MINIMOS_INDICADOR = 3;

export type Indicadores = {
  /** Receita líquida ÷ eventos com venda no período; `null` sem evento. */
  receitaLiquidaMediaPorEventoCentavos: number | null;
  /** Custo mensal de armazenamento ÷ GB guardados; `null` sem dado. */
  custoPorGbCentavos: number | null;
  /** Custo fixo mensal ÷ receita média por evento, para cima; `null` com dados insuficientes. */
  eventosParaCobrirCustos: number | null;
};

export function calcularIndicadores(e: {
  receitaLiquidaCentavos: number;
  eventosComVenda: number;
  custoFixoMensalCentavos: number | null;
  custoArmazenamentoMensalCentavos: number | null;
  gbArmazenadosX1000: number;
}): Indicadores {
  const media =
    e.eventosComVenda > 0 ? dividirArredondando(e.receitaLiquidaCentavos, e.eventosComVenda) : null;
  const custoPorGb =
    e.custoArmazenamentoMensalCentavos && e.gbArmazenadosX1000 > 0
      ? dividirArredondando(e.custoArmazenamentoMensalCentavos * 1000, e.gbArmazenadosX1000)
      : null;
  const eventos =
    media !== null &&
    media > 0 &&
    e.eventosComVenda >= EVENTOS_MINIMOS_INDICADOR &&
    e.custoFixoMensalCentavos !== null
      ? Math.ceil(e.custoFixoMensalCentavos / media)
      : null;
  return {
    receitaLiquidaMediaPorEventoCentavos: media,
    custoPorGbCentavos: custoPorGb,
    eventosParaCobrirCustos: eventos,
  };
}

// ---------------------------------------------------------------- Formulário da cobrança

/** Teto de uma cobrança: R$/US$ 1.000.000,00. */
const COBRANCA_MAXIMA = 100_000_000;

export const formularioCobranca = z.object({
  assinaturaId: z.uuid("Despesa não encontrada."),
  cobrancaId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  data: z.string().refine(diaValido, "Informe a data da cobrança."),
  valor: z.string().trim().min(1, "Informe o valor."),
  moeda: z.enum(["BRL", "USD"], "Escolha a moeda."),
  cotacao: z.string().trim().max(12),
  iof: z.string().trim().max(14),
  status: z.enum(["paga", "pendente", "prevista", "provisionada"], "Escolha a situação."),
  pagoPeloSaldoMp: z.boolean(),
  observacao: z.string().trim().max(500, "Use até 500 caracteres."),
});

export type CampoCobranca = Exclude<keyof z.infer<typeof formularioCobranca>, "cobrancaId">;

export type DadosDaCobranca = {
  assinaturaId: string;
  data: string;
  valorCentavos: number;
  moeda: "BRL" | "USD";
  cotacaoDezMilesimos: number | null;
  valorBrlCentavos: number;
  iofCentavos: number;
  status: StatusCobranca;
  pagoPeloSaldoMp: boolean;
  observacao: string;
};

/**
 * Valida a cobrança (campos em texto). Em dólar, a cotação vazia vira a de referência
 * (`cotacaoPadrao`), e a usada fica gravada na cobrança.
 */
export function validarCobranca(
  entrada: Record<string, unknown>,
  cotacaoPadrao: number,
):
  | { ok: true; id: string | undefined; dados: DadosDaCobranca }
  | { ok: false; erros: Partial<Record<CampoCobranca, string>> } {
  const r = formularioCobranca.safeParse({
    cotacao: "",
    iof: "",
    observacao: "",
    ...entrada,
    pagoPeloSaldoMp: entrada.pagoPeloSaldoMp === "on" || entrada.pagoPeloSaldoMp === true,
  });
  if (!r.success) {
    const erros: Partial<Record<CampoCobranca, string>> = {};
    for (const p of r.error.issues) erros[p.path[0] as CampoCobranca] ??= p.message;
    return { ok: false, erros };
  }
  const d = r.data;
  const valorCentavos = reaisParaCentavos(d.valor);
  if (valorCentavos === null || valorCentavos > COBRANCA_MAXIMA) {
    return { ok: false, erros: { valor: "Informe um valor como 106,99." } };
  }
  const iofCentavos = d.iof ? reaisParaCentavos(d.iof) : 0;
  if (iofCentavos === null || iofCentavos > COBRANCA_MAXIMA) {
    return { ok: false, erros: { iof: "Informe o IOF em reais, como 6,80 (ou deixe vazio)." } };
  }
  let cotacao: number | null = null;
  if (d.moeda === "USD") {
    cotacao = d.cotacao ? lerCotacao(d.cotacao) : cotacaoPadrao;
    if (cotacao === null) {
      return {
        ok: false,
        erros: { cotacao: "Informe a cotação, entre R$ 1 e R$ 50 (ex.: 5,3495)." },
      };
    }
  }
  const valores = valoresDaCobranca(valorCentavos, d.moeda, cotacao)!;
  return {
    ok: true,
    id: d.cobrancaId,
    dados: {
      assinaturaId: d.assinaturaId,
      data: d.data,
      valorCentavos,
      moeda: d.moeda,
      cotacaoDezMilesimos: valores.cotacaoDezMilesimos,
      valorBrlCentavos: valores.valorBrlCentavos,
      iofCentavos,
      status: d.status,
      pagoPeloSaldoMp: d.pagoPeloSaldoMp,
      observacao: d.observacao,
    },
  };
}
