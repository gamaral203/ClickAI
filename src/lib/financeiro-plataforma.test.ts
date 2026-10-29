import { describe, expect, it } from "vitest";

import {
  calcularIndicadores,
  conciliar,
  converterParaReal,
  decomporPedido,
  dividirArredondando,
  evolucaoMensal,
  lerCotacao,
  lerPercentualPb,
  periodoFinanceiro,
  ratear,
  resumirDespesas,
  resumirVendas,
  taxaEstimada,
  ultimosMeses,
  validarCobranca,
  type LancamentoParaDecomposicao,
  type PedidoParaDecomposicao,
} from "./financeiro-plataforma";
import { idsDePagamento, lerTaxaDoPagamento, valorDaApiParaCentavos } from "./mercadopago";
import { acrescimoCartao, parteDoVendedorNaTaxa } from "./taxas";

// Contas do Financeiro da ClicouAí: decomposição de cada pedido, taxa do Mercado Pago (real e
// estimada), comissão realizada (pelo saque gravado) e a realizar (% atual), câmbio com a
// cotação gravada e IOF, períodos em Brasília e a conciliação com o saldo informado.

const TAXAS = { pixPb: 99, cartaoPb: 498 };

function pedido(parcial: Partial<PedidoParaDecomposicao> = {}): PedidoParaDecomposicao {
  return {
    status: "pago",
    metodo: "pix",
    totalCentavos: 10_000,
    acrescimoCartaoCentavos: 0,
    taxaGatewayCentavos: null,
    liquidoRecebidoCentavos: null,
    taxaGatewayOrigem: null,
    ...parcial,
  };
}

const semSaque = (valor: number, pct = 8): LancamentoParaDecomposicao => ({
  valorCentavos: valor,
  saque: null,
  comissaoPctAtual: pct,
});

describe("inteiros", () => {
  it("divide arredondando o meio para longe do zero", () => {
    expect(dividirArredondando(5, 2)).toBe(3);
    expect(dividirArredondando(-5, 2)).toBe(-3);
    expect(dividirArredondando(4, 3)).toBe(1);
    expect(dividirArredondando(0, 7)).toBe(0);
  });

  it("rateia sem perder centavo", () => {
    expect(ratear(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(ratear(1001, [700, 300])).toEqual([701, 300]);
    expect(ratear(-10, [1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(-10);
    expect(ratear(7, [0, 0])).toEqual([4, 3]);
    for (let total = 0; total < 3000; total += 97) {
      expect(ratear(total, [3, 5, 11]).reduce((s, v) => s + v, 0)).toBe(total);
    }
  });

  it("lê percentuais e cotações sem ponto flutuante", () => {
    expect(lerPercentualPb("0,99")).toBe(99);
    expect(lerPercentualPb("4.98%")).toBe(498);
    expect(lerPercentualPb("25")).toBeNull();
    expect(lerPercentualPb("abc")).toBeNull();
    expect(lerCotacao("5,3495")).toBe(53_495);
    expect(lerCotacao("5,45")).toBe(54_500);
    expect(lerCotacao("0,50")).toBeNull();
  });
});

describe("decomposição do pedido", () => {
  it("Pix pago, sem saque: comissão a realizar de 8%, taxa estimada de 0,99% toda da plataforma", () => {
    const d = decomporPedido(pedido(), [semSaque(10_000)], TAXAS);
    expect(d.situacao).toBe("receita");
    expect(d.parteFotografosCentavos).toBe(10_000);
    expect(d.comissaoRealizadaCentavos).toBe(0);
    expect(d.comissaoARealizarCentavos).toBe(800);
    expect(d.taxaGatewayCentavos).toBe(99);
    expect(d.taxaOrigem).toBe("estimada_na_leitura");
    expect(d.coberturaDaTaxaCentavos).toBe(0);
    expect(d.taxaAbsorvidaCentavos).toBe(99);
    expect(d.receitaLiquidaCentavos).toBe(701);
    expect(d.liquidoRecebidoCentavos).toBe(9_901);
    expect(d.repasseASacarCentavos).toBe(9_200);
  });

  it("taxa real gravada vence a estimativa", () => {
    const d = decomporPedido(
      pedido({ taxaGatewayCentavos: 100, liquidoRecebidoCentavos: 9_900, taxaGatewayOrigem: "mp" }),
      [semSaque(10_000)],
      TAXAS,
    );
    expect(d.taxaGatewayCentavos).toBe(100);
    expect(d.taxaOrigem).toBe("mp");
    expect(d.liquidoRecebidoCentavos).toBe(9_900);
    expect(d.receitaLiquidaCentavos).toBe(700);
  });

  it("cartão: comprador e fotógrafo cobrem a taxa; a plataforma não absorve (só o arredondamento)", () => {
    const itens = 10_000;
    const acrescimo = acrescimoCartao(itens, 4.98);
    const parte = itens - parteDoVendedorNaTaxa(itens, 4.98);
    const total = itens + acrescimo;
    const d = decomporPedido(
      pedido({ metodo: "cartao", totalCentavos: total, acrescimoCartaoCentavos: acrescimo }),
      [semSaque(parte)],
      TAXAS,
    );
    expect(d.taxaGatewayCentavos).toBe(taxaEstimada(total, "cartao", TAXAS));
    expect(d.coberturaDaTaxaCentavos).toBe(acrescimo + (itens - parte));
    // Arredondamentos para cima no acréscimo: a plataforma nunca paga mais que 1 centavo.
    expect(d.taxaAbsorvidaCentavos).toBeLessThanOrEqual(1);
    expect(d.receitaLiquidaCentavos).toBe(d.receitaBrutaCentavos - d.taxaAbsorvidaCentavos);
  });

  it("com desconto: a comissão sai do valor pago, não do preço de tabela", () => {
    // Fotos de R$ 120 com R$ 20 de desconto: total e parte do fotógrafo são R$ 100.
    const d = decomporPedido(pedido({ totalCentavos: 10_000 }), [semSaque(10_000)], TAXAS);
    expect(d.comissaoARealizarCentavos).toBe(800);
  });

  it("comissão realizada usa o valor gravado no saque (10% do começo), não o % atual", () => {
    const saque10 = {
      status: "pago" as const,
      brutoCentavos: 20_000,
      comissaoCentavos: 2_000,
      taxaAntecipacaoCentavos: 0,
    };
    const d = decomporPedido(
      pedido(),
      [{ valorCentavos: 10_000, saque: saque10, comissaoPctAtual: 8 }],
      TAXAS,
    );
    expect(d.comissaoRealizadaCentavos).toBe(1_000);
    expect(d.comissaoARealizarCentavos).toBe(0);
    expect(d.repasseSacadoCentavos).toBe(9_000);
    expect(d.repasseASacarCentavos).toBe(0);
  });

  it("mistura sacado (8% gravado, com antecipação) e não sacado; arredonda o rateio do saque", () => {
    const saque = {
      status: "processando" as const,
      brutoCentavos: 3_333,
      comissaoCentavos: 266,
      taxaAntecipacaoCentavos: 66,
    };
    const d = decomporPedido(
      pedido({ totalCentavos: 2_000 }),
      [{ valorCentavos: 1_000, saque, comissaoPctAtual: 8 }, semSaque(1_000)],
      TAXAS,
    );
    // 1000 × 266 / 3333 = 79,8 → 80; 1000 × 66 / 3333 = 19,8 → 20.
    expect(d.comissaoRealizadaCentavos).toBe(80);
    expect(d.taxaAntecipacaoCentavos).toBe(20);
    expect(d.comissaoARealizarCentavos).toBe(80);
    // Saque em processamento ainda não é "sacado".
    expect(d.repasseSacadoCentavos).toBe(0);
    expect(d.repasseASacarCentavos).toBe(2_000 - 180);
  });

  it("saque que falhou conta como não sacado", () => {
    const d = decomporPedido(
      pedido(),
      [
        {
          valorCentavos: 10_000,
          saque: {
            status: "falhou",
            brutoCentavos: 10_000,
            comissaoCentavos: 800,
            taxaAntecipacaoCentavos: 0,
          },
          comissaoPctAtual: 8,
        },
      ],
      TAXAS,
    );
    expect(d.comissaoRealizadaCentavos).toBe(0);
    expect(d.comissaoARealizarCentavos).toBe(800);
  });

  it("pendente, expirado e cancelado nunca são receita", () => {
    for (const status of ["pendente", "expirado", "cancelado"] as const) {
      const d = decomporPedido(pedido({ status }), [semSaque(10_000)], TAXAS);
      expect(d.situacao).toBe("sem_receita");
      expect(d.receitaBrutaCentavos).toBe(0);
      expect(d.receitaLiquidaCentavos).toBe(0);
      expect(d.taxaGatewayCentavos).toBe(0);
    }
  });

  it("estornado e contestado ficam à parte no resumo", () => {
    const ds = [
      decomporPedido(pedido(), [semSaque(10_000)], TAXAS),
      decomporPedido(pedido({ status: "estornado", totalCentavos: 5_000 }), [], TAXAS),
      decomporPedido(pedido({ status: "contestado", totalCentavos: 3_000 }), [], TAXAS),
      decomporPedido(pedido({ status: "pendente" }), [], TAXAS),
    ];
    const r = resumirVendas(ds);
    expect(r.pedidosPagos).toBe(1);
    expect(r.volumeBrutoCentavos).toBe(10_000);
    expect(r.estornados).toEqual({ pedidos: 1, centavos: 5_000 });
    expect(r.contestados).toEqual({ pedidos: 1, centavos: 3_000 });
    expect(r.receitaLiquidaCentavos).toBe(701);
    expect(r.taxasEstimadas).toBe(1);
  });

  it("os números dos donos fecham: R$ 6.000 em Pix, 8%, ~1% de taxa", () => {
    const d = decomporPedido(pedido({ totalCentavos: 600_000 }), [semSaque(600_000)], TAXAS);
    expect(d.receitaBrutaCentavos).toBe(48_000);
    expect(d.taxaGatewayCentavos).toBe(5_940);
    expect(d.receitaLiquidaCentavos).toBe(42_060);
  });
});

describe("taxa lida no Mercado Pago", () => {
  it("soma fee_details do recebedor e lê o net_received_amount", () => {
    const corpo = {
      transaction_amount: 100,
      fee_details: [
        { type: "mercadopago_fee", amount: 0.99, fee_payer: "collector" },
        { type: "financing_fee", amount: 3.5, fee_payer: "payer" },
      ],
      transaction_details: { net_received_amount: 99.01 },
    };
    expect(lerTaxaDoPagamento(corpo, 10_000)).toEqual({ taxaCentavos: 99, liquidoCentavos: 9_901 });
  });

  it("sem fee_details, deduz pelo líquido; sem nada, null", () => {
    expect(
      lerTaxaDoPagamento(
        { transaction_amount: "20.00", transaction_details: { net_received_amount: "19.80" } },
        2_000,
      ),
    ).toEqual({ taxaCentavos: 20, liquidoCentavos: 1_980 });
    expect(lerTaxaDoPagamento({}, 2_000)).toBeNull();
    expect(
      lerTaxaDoPagamento({ transaction_details: { net_received_amount: 30 } }, 2_000),
    ).toBeNull();
  });

  it("só ids numéricos da order vão ao GET /v1/payments (reference_id primeiro)", () => {
    expect(
      idsDePagamento([
        { id: "PAY01JEVQM899", reference_id: "123456789", status: "processed" },
        { id: "987654321", status: "processed" },
        { id: "PAY02", reference_id: 123456789, status: "processed" },
      ]),
    ).toEqual(["123456789", "987654321"]);
  });

  it("converte o número da API pelo texto, sem erro de ponto flutuante", () => {
    expect(valorDaApiParaCentavos(0.1 + 0.2)).toBe(30);
    expect(valorDaApiParaCentavos(106.99)).toBe(10_699);
    expect(valorDaApiParaCentavos(-1)).toBeNull();
  });
});

describe("despesas e câmbio", () => {
  it("US$ 20 a R$ 5,3495 = R$ 106,99; US$ 2,14 = R$ 11,45", () => {
    expect(converterParaReal(2_000, 53_495)).toBe(10_699);
    expect(converterParaReal(214, 53_495)).toBe(1_145);
  });

  it("a cobrança guarda a cotação usada e o IOF à parte", () => {
    const r = validarCobranca(
      {
        assinaturaId: "0b0e8c4e-9e2a-4c51-a1d5-7b2a1c3d4e5f",
        data: "2026-10-11",
        valor: "20,00",
        moeda: "USD",
        cotacao: "5,50",
        iof: "3,85",
        status: "paga",
        pagoPeloSaldoMp: "on",
      },
      53_495,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.cotacaoDezMilesimos).toBe(55_000);
    expect(r.dados.valorBrlCentavos).toBe(11_000);
    expect(r.dados.iofCentavos).toBe(385);
    expect(r.dados.pagoPeloSaldoMp).toBe(true);
  });

  it("sem cotação digitada usa a de referência; em reais não guarda cotação", () => {
    const base = {
      assinaturaId: "0b0e8c4e-9e2a-4c51-a1d5-7b2a1c3d4e5f",
      data: "2026-10-11",
      valor: "20",
      status: "prevista",
    };
    const usd = validarCobranca({ ...base, moeda: "USD" }, 53_495);
    expect(usd.ok && usd.dados.cotacaoDezMilesimos).toBe(53_495);
    const brl = validarCobranca({ ...base, moeda: "BRL", cotacao: "9,99" }, 53_495);
    expect(brl.ok && brl.dados).toMatchObject({
      cotacaoDezMilesimos: null,
      valorBrlCentavos: 2_000,
    });
    expect(validarCobranca({ ...base, moeda: "BRL", valor: "abc" }, 53_495).ok).toBe(false);
    expect(validarCobranca({ ...base, moeda: "BRL", data: "2026-02-30" }, 53_495).ok).toBe(false);
  });

  it("nunca mistura reserva com pagamento", () => {
    const c = (
      status: "paga" | "pendente" | "prevista" | "provisionada",
      valor: number,
      iof = 0,
    ) => ({
      data: "2026-10-01",
      status,
      valorBrlCentavos: valor,
      iofCentavos: iof,
      categoria: "hospedagem",
      pagoPeloSaldoMp: false,
    });
    const r = resumirDespesas([
      c("paga", 10_699, 300),
      c("prevista", 10_699),
      c("provisionada", 1_145),
      c("pendente", 500),
    ]);
    expect(r.pagasCentavos).toBe(10_999);
    expect(r.previstasCentavos).toBe(10_699);
    expect(r.provisionadasCentavos).toBe(1_145);
    expect(r.pendentesCentavos).toBe(500);
    expect(r.porCategoria).toEqual([{ categoria: "hospedagem", centavos: 10_999 }]);
  });
});

describe("conciliação", () => {
  it("saldo calculado, parte da plataforma e diferença não justificada", () => {
    const c = conciliar({
      saldoInformado: { centavos: 47_700, dia: "2026-10-28" },
      entradasLiquidasCentavos: 594_000,
      saquesPagosCentavos: 552_000,
      saquesProcessandoCentavos: 0,
      despesasPagasSaldoCentavos: 5_300,
      despesasReservadasSaldoCentavos: 1_000,
      aSacarFotografosCentavos: 0,
    });
    expect(c.saldoCalculadoCentavos).toBe(36_700);
    expect(c.diferencaCentavos).toBe(11_000);
    expect(c.saldoAposReservasCentavos).toBe(35_700);
    expect(conciliar({ ...c, saldoInformado: null }).diferencaCentavos).toBeNull();
  });
});

describe("períodos em Brasília", () => {
  // 28/10/2026 01:30 em UTC = 27/10/2026 22:30 em Brasília.
  const quaseMeiaNoite = Date.UTC(2026, 9, 28, 1, 30);

  it("hoje e 7 dias seguem o calendário de Brasília, não o UTC", () => {
    const hoje = periodoFinanceiro("hoje", quaseMeiaNoite);
    expect(hoje.diaInicio).toBe("2026-10-27");
    expect(hoje.inicio).toBe("2026-10-27T00:00:00-03:00");
    expect(hoje.fim).toBe("2026-10-28T00:00:00-03:00");
    const sete = periodoFinanceiro("7d", quaseMeiaNoite);
    expect(sete.diaInicio).toBe("2026-10-21");
    expect(sete.diaFim).toBe("2026-10-28");
  });

  it("mês atual, anterior (virada de ano) e ano atual", () => {
    expect(periodoFinanceiro("mes", quaseMeiaNoite).diaInicio).toBe("2026-10-01");
    const janeiro = Date.UTC(2027, 0, 1, 2, 0); // 31/12/2026 23:00 em Brasília
    expect(periodoFinanceiro("mes_anterior", janeiro)).toMatchObject({
      diaInicio: "2026-11-01",
      diaFim: "2026-12-01",
    });
    expect(periodoFinanceiro("ano", janeiro).diaInicio).toBe("2026-01-01");
  });

  it("personalizado inclui o último dia; inválido cai no mês atual", () => {
    const p = periodoFinanceiro("personalizado", quaseMeiaNoite, "2026-10-01", "2026-10-15");
    expect(p).toMatchObject({ diaInicio: "2026-10-01", diaFim: "2026-10-16", invalido: false });
    const invertido = periodoFinanceiro(
      "personalizado",
      quaseMeiaNoite,
      "2026-10-15",
      "2026-10-01",
    );
    expect(invertido).toMatchObject({ tipo: "mes", invalido: true });
    expect(
      periodoFinanceiro("personalizado", quaseMeiaNoite, "2026-02-30", "2026-03-01").invalido,
    ).toBe(true);
  });

  it("evolução mensal agrupa pelo mês de Brasília", () => {
    const meses = ultimosMeses(2, quaseMeiaNoite);
    expect(meses).toEqual(["2026-09", "2026-10"]);
    const d = decomporPedido(pedido(), [semSaque(10_000)], TAXAS);
    // 01/10/2026 01:00 UTC ainda é 30/09 em Brasília.
    const pontos = evolucaoMensal(
      meses,
      [{ pagoEm: "2026-10-01T01:00:00Z", d }],
      [
        {
          data: "2026-10-11",
          status: "paga",
          valorBrlCentavos: 10_699,
          iofCentavos: 0,
          categoria: "hospedagem",
          pagoPeloSaldoMp: false,
        },
      ],
    );
    expect(pontos[0]).toMatchObject({
      mes: "2026-09",
      volumeCentavos: 10_000,
      receitaLiquidaCentavos: 701,
    });
    expect(pontos[1]).toMatchObject({
      mes: "2026-10",
      despesasCentavos: 10_699,
      resultadoCentavos: -10_699,
    });
  });
});

describe("indicadores", () => {
  it("só calcula eventos para cobrir custos com dados suficientes", () => {
    const poucos = calcularIndicadores({
      receitaLiquidaCentavos: 10_000,
      eventosComVenda: 2,
      custoFixoMensalCentavos: 22_000,
      custoArmazenamentoMensalCentavos: 1_145,
      gbArmazenadosX1000: 155_000,
    });
    expect(poucos.eventosParaCobrirCustos).toBeNull();
    expect(poucos.receitaLiquidaMediaPorEventoCentavos).toBe(5_000);
    expect(poucos.custoPorGbCentavos).toBe(7);
    const varios = calcularIndicadores({
      receitaLiquidaCentavos: 30_000,
      eventosComVenda: 3,
      custoFixoMensalCentavos: 22_000,
      custoArmazenamentoMensalCentavos: null,
      gbArmazenadosX1000: 0,
    });
    expect(varios.eventosParaCobrirCustos).toBe(3);
    expect(varios.custoPorGbCentavos).toBeNull();
  });
});
