import { describe, expect, it } from "vitest";

import type { MetodoPagamento, Saque } from "@/dados/tipos";

import {
  calcularSaldo,
  calcularSaque,
  proximaTransferenciaEm,
  resumoFinanceiro,
  transferenciaVencida,
  type LancamentoComMetodo,
} from "./financeiro";
import { aplicarLiberacao, saqueSemPrazo } from "./saques";

const DIA = 24 * 60 * 60 * 1000;
const agora = Date.UTC(2026, 9, 7, 12);

/**
 * Lançamento de uma venda paga `dias` atrás, como lancamentosDaVenda grava hoje: Pix com
 * `disponivelEm` em 1 dia, cartão em 30. `legado`: Pix gravado antes da mudança, com 30 dias.
 */
function venda(
  id: string,
  valorCentavos: number,
  dias: number,
  metodo: MetodoPagamento,
  { saqueId = null, legado = false }: { saqueId?: string | null; legado?: boolean } = {},
): LancamentoComMetodo {
  const pagoEm = agora - dias * DIA;
  const prazo = metodo === "pix" && !legado ? DIA : 30 * DIA;
  return {
    id,
    valorCentavos,
    disponivelEm: new Date(pagoEm + prazo).toISOString(),
    antecipavelEm: new Date(pagoEm + DIA).toISOString(),
    saqueId,
    metodo,
  };
}

/** Estorno de uma venda ainda sem saque: mesmo prazo, valor negativo. */
function estorno(de: LancamentoComMetodo): LancamentoComMetodo {
  return { ...de, id: `estorno-${de.id}`, valorCentavos: -de.valorCentavos };
}

describe("os três exemplos de R$ 100 (comissão de 8%)", () => {
  it("Pix: R$ 92,00 depois de 1 dia, sem taxa", () => {
    expect(calcularSaldo([venda("p", 10_000, 0.5, "pix")], agora, 8, false)).toMatchObject({
      disponivelCentavos: 0,
      aReceberCentavos: 10_000,
    });
    const saldo = calcularSaldo([venda("p", 10_000, 1, "pix")], agora, 8, false);
    expect(saldo).toMatchObject({
      lancamentoIds: ["p"],
      brutoCentavos: 10_000,
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 0,
      liquidoCentavos: 9_200,
      disponivelCentavos: 9_200,
      aReceberCentavos: 0,
    });
  });

  it("cartão sem antecipação: R$ 92,00 depois de 30 dias, sem taxa", () => {
    const com29 = calcularSaldo([venda("c", 10_000, 29, "cartao")], agora, 8, false);
    expect(com29).toMatchObject({
      disponivelCentavos: 0,
      aReceberCentavos: 10_000,
      // O que daria antecipando agora: 100 − 8,00 − 1,99.
      antecipavelCentavos: 10_000,
      antecipavelLiquidoCentavos: 9_001,
    });
    const com30 = calcularSaldo([venda("c", 10_000, 30, "cartao")], agora, 8, false);
    expect(com30).toMatchObject({
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 0,
      disponivelCentavos: 9_200,
      antecipavelCentavos: 0,
    });
  });

  it("cartão com antecipação: R$ 90,01 depois de 1 dia (8,00 + 1,99)", () => {
    expect(calcularSaldo([venda("c", 10_000, 0.5, "cartao")], agora, 8, true)).toMatchObject({
      disponivelCentavos: 0,
      aReceberCentavos: 10_000,
    });
    const saldo = calcularSaldo([venda("c", 10_000, 1, "cartao")], agora, 8, true);
    expect(saldo).toMatchObject({
      lancamentoIds: ["c"],
      brutoCentavos: 10_000,
      antecipadoCentavos: 10_000,
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 199,
      taxaCentavos: 999,
      liquidoCentavos: 9_001,
    });
  });

  it("cartão com antecipação e já com 30 dias: sem taxa de antecipação", () => {
    const saque = calcularSaque([venda("c", 10_000, 31, "cartao")], agora, 8, true);
    expect(saque.taxaAntecipacaoCentavos).toBe(0);
    expect(saque.liquidoCentavos).toBe(9_200);
  });
});

describe("Pix nunca paga 1,99%", () => {
  it("nem com a antecipação do cartão ligada, nem nos lançamentos antigos de 30 dias", () => {
    const lancamentos = [
      venda("novo", 10_000, 2, "pix"),
      venda("antigo", 5_000, 10, "pix", { legado: true }),
      venda("antigo-maduro", 3_000, 40, "pix", { legado: true }),
    ];
    for (const antecipar of [false, true]) {
      const saque = calcularSaque(lancamentos, agora, 8, antecipar);
      expect(saque.lancamentoIds).toEqual(["novo", "antigo", "antigo-maduro"]);
      expect(saque.antecipadoCentavos).toBe(0);
      expect(saque.taxaAntecipacaoCentavos).toBe(0);
      expect(saque.liquidoCentavos).toBe(18_000 - 1_440);
    }
  });

  it("o lançamento antigo de Pix não muda de valor, só de prazo", () => {
    const antigo = venda("antigo", 5_000, 2, "pix", { legado: true });
    const saldo = calcularSaldo([antigo], agora, 8, false);
    expect(saldo.brutoCentavos).toBe(antigo.valorCentavos);
    expect(saldo.disponivelCentavos).toBe(4_600);
  });
});

describe("comissão e estornos", () => {
  it("comissão uma vez só, sobre o bruto do saque; a antecipação só sobre o cartão antecipado", () => {
    const saque = calcularSaque(
      [venda("pix", 10_000, 2, "pix"), venda("cartao", 10_000, 2, "cartao")],
      agora,
      8,
      true,
    );
    expect(saque.comissaoCentavos).toBe(1_600);
    expect(saque.taxaAntecipacaoCentavos).toBe(199);
    expect(saque.liquidoCentavos).toBe(20_000 - 1_600 - 199);
  });

  it("estorno de venda sem saque abate no mesmo prazo, sem comissão nem antecipação sobre ele", () => {
    const cartao = venda("cartao", 10_000, 5, "cartao");
    const saque = calcularSaque(
      [cartao, estorno(cartao), venda("pix", 5_000, 3, "pix")],
      agora,
      8,
      true,
    );
    expect(saque.lancamentoIds).toEqual(["cartao", "estorno-cartao", "pix"]);
    expect(saque.brutoCentavos).toBe(5_000);
    expect(saque.antecipadoCentavos).toBe(0);
    expect(saque.taxaAntecipacaoCentavos).toBe(0);
    expect(saque.liquidoCentavos).toBe(4_600);
  });

  it("estorno de venda já sacada (disponível na hora) abate do próximo saque", () => {
    const iso = new Date(agora - 1000).toISOString();
    const negativo: LancamentoComMetodo = {
      id: "negativo",
      valorCentavos: -3_000,
      disponivelEm: iso,
      antecipavelEm: iso,
      saqueId: null,
      metodo: "cartao",
    };
    const saque = calcularSaque([venda("pix", 10_000, 2, "pix"), negativo], agora, 8, true);
    expect(saque.brutoCentavos).toBe(7_000);
    expect(saque.taxaAntecipacaoCentavos).toBe(0);
    expect(saque.liquidoCentavos).toBe(7_000 - 560);
  });

  it("arredonda as taxas para baixo: o centavo fica com o fotógrafo", () => {
    const saque = calcularSaque([venda("x", 999, 2, "cartao")], agora, 10, true);
    // 10% de 9,99 = 0,999 → 0,99; 1,99% de 9,99 = 0,198801 → 0,19.
    expect(saque.comissaoCentavos).toBe(99);
    expect(saque.taxaAntecipacaoCentavos).toBe(19);
    expect(saque.liquidoCentavos).toBe(881);
  });

  it("ignora o que já está num saque", () => {
    const saldo = calcularSaldo(
      [venda("livre", 10_000, 2, "pix"), venda("sacada", 9_999, 60, "pix", { saqueId: "s1" })],
      agora,
      8,
      false,
    );
    expect(saldo.lancamentoIds).toEqual(["livre"]);
    expect(saldo.brutoCentavos).toBe(10_000);
  });
});

describe("resumoFinanceiro", () => {
  const saque = (parcial: Partial<Saque>) =>
    ({
      status: "pago",
      comissaoCentavos: 0,
      taxaAntecipacaoCentavos: 0,
      liquidoCentavos: 0,
      ...parcial,
    }) as Saque;

  it("separa comissão, antecipação, transferido e pendente, e fecha com os saques", () => {
    const lancamentos = [
      { valorCentavos: 10_000, saqueId: "pago" },
      { valorCentavos: 10_000, saqueId: "processando" },
      { valorCentavos: 5_000, saqueId: null },
      { valorCentavos: -1_000, saqueId: null },
    ];
    const saques = [
      saque({ status: "pago", comissaoCentavos: 800, liquidoCentavos: 9_200 }),
      saque({
        status: "processando",
        comissaoCentavos: 800,
        taxaAntecipacaoCentavos: 199,
        liquidoCentavos: 9_001,
      }),
      // Saque que falhou devolveu os lançamentos: não conta.
      saque({ status: "falhou", comissaoCentavos: 999, liquidoCentavos: 1 }),
    ];
    const resumo = resumoFinanceiro(lancamentos, saques, 8);
    expect(resumo).toEqual({
      vendasBrutoCentavos: 24_000,
      comissaoCentavos: 800 + 800 + 320,
      taxasAntecipacaoCentavos: 199,
      ganhosLiquidosCentavos: 24_000 - 1_920 - 199,
      transferidoCentavos: 9_200,
      pendenteCentavos: 9_001,
    });
    // Ganhos = transferido + pendente + o líquido do saldo sem saque (4.000 − 8%).
    expect(resumo.ganhosLiquidosCentavos).toBe(9_200 + 9_001 + 3_680);
  });
});

describe("transferência automática: intervalo da frequência", () => {
  const ligadaEm = new Date(agora - 10 * DIA).toISOString();
  const conta = (parcial: object) => ({
    transferenciaAutomatica: true,
    frequenciaTransferencia: "semanal" as const,
    transferenciaAutomaticaDesde: ligadaEm,
    ultimaTransferenciaAutomaticaEm: null,
    ...parcial,
  });

  it("conta de quando foi ligada e depois da última transferência", () => {
    expect(transferenciaVencida(conta({}), agora)).toBe(true);
    expect(transferenciaVencida(conta({ frequenciaTransferencia: "mensal" }), agora)).toBe(false);
    const ontem = new Date(agora - DIA).toISOString();
    expect(transferenciaVencida(conta({ ultimaTransferenciaAutomaticaEm: ontem }), agora)).toBe(
      false,
    );
    expect(
      transferenciaVencida(
        conta({ ultimaTransferenciaAutomaticaEm: ontem, frequenciaTransferencia: "diaria" }),
        agora,
      ),
    ).toBe(true);
    expect(proximaTransferenciaEm(conta({ ultimaTransferenciaAutomaticaEm: ontem }))).toBe(
      new Date(agora + 6 * DIA).toISOString(),
    );
  });

  it("desligada nunca vence", () => {
    expect(transferenciaVencida(conta({ transferenciaAutomatica: false }), agora)).toBe(false);
    expect(proximaTransferenciaEm(conta({ transferenciaAutomatica: false }))).toBeNull();
  });
});

describe("liberação de teste (SAQUE_SEM_PRAZO_EMAILS)", () => {
  const gestor = { id: "u1", email: "Gestor@Exemplo.com", papel: "admin" as const };
  const contaDoGestor = { usuarioId: "u1" };
  const lista = " outro@exemplo.com , gestor@exemplo.com ";
  const hoje = [venda("hoje", 10_000, 0, "cartao")];

  function saldoCom(
    usuario: Parameters<typeof saqueSemPrazo>[0],
    conta: Parameters<typeof saqueSemPrazo>[1],
    variavel: string | undefined,
  ) {
    const liberado = saqueSemPrazo(usuario, conta, variavel);
    return calcularSaldo(aplicarLiberacao(hoje, agora, liberado), agora, 10, false);
  }

  it("gestor na lista: venda de hoje fica disponível, só com a comissão", () => {
    expect(saqueSemPrazo(gestor, contaDoGestor, lista)).toBe(true);
    const saldo = saldoCom(gestor, contaDoGestor, lista);
    expect(saldo.lancamentoIds).toEqual(["hoje"]);
    expect(saldo.aReceberCentavos).toBe(0);
    expect(saldo.comissaoCentavos).toBe(1_000);
    expect(saldo.taxaAntecipacaoCentavos).toBe(0);
    expect(saldo.liquidoCentavos).toBe(9_000);
  });

  it("e-mail na lista mas papel fotógrafo: prazo normal", () => {
    const fotografo = { ...gestor, papel: "fotografo" as const };
    expect(saqueSemPrazo(fotografo, contaDoGestor, lista)).toBe(false);
    expect(saldoCom(fotografo, contaDoGestor, lista).disponivelCentavos).toBe(0);
  });

  it("sem a variável: prazo normal", () => {
    expect(saqueSemPrazo(gestor, contaDoGestor, undefined)).toBe(false);
    expect(saqueSemPrazo(gestor, contaDoGestor, "")).toBe(false);
    const saldo = saldoCom(gestor, contaDoGestor, undefined);
    expect(saldo.disponivelCentavos).toBe(0);
    expect(saldo.aReceberCentavos).toBe(10_000);
  });

  it("outro fotógrafo: prazo normal", () => {
    const outro = { id: "u2", email: "fulano@exemplo.com", papel: "fotografo" as const };
    expect(saqueSemPrazo(outro, { usuarioId: "u2" }, lista)).toBe(false);
    expect(saldoCom(outro, { usuarioId: "u2" }, lista).disponivelCentavos).toBe(0);
    // Outro gestor fora da lista também não.
    const outroGestor = { ...outro, papel: "admin" as const };
    expect(saqueSemPrazo(outroGestor, { usuarioId: "u2" }, lista)).toBe(false);
  });

  it("conta de fotógrafo de outro usuário ou transferência automática: não libera", () => {
    expect(saqueSemPrazo(gestor, { usuarioId: "u2" }, lista)).toBe(false);
    expect(saqueSemPrazo(null, contaDoGestor, lista)).toBe(false);
  });
});
