import { describe, expect, it } from "vitest";

import type { Lancamento } from "@/dados/tipos";

import { calcularSaldo, calcularSaque } from "./saques";

const DIA = 24 * 60 * 60 * 1000;
const agora = Date.UTC(2026, 9, 7, 12);

/** Lançamento de uma venda feita `dias` atrás. */
function venda(id: string, valorCentavos: number, dias: number, saqueId: string | null = null) {
  const vendidoEm = agora - dias * DIA;
  return {
    id,
    fotografoId: "f",
    itemPedidoId: `item-${id}`,
    valorCentavos,
    disponivelEm: new Date(vendidoEm + 30 * DIA).toISOString(),
    antecipavelEm: new Date(vendidoEm + DIA).toISOString(),
    saqueId,
  } satisfies Lancamento;
}

const lancamentos = [
  venda("madura", 10_000, 40),
  venda("antecipavel", 5_000, 10),
  venda("nova", 2_000, 0.5),
  venda("ja-sacada", 9_999, 60, "saque-1"),
];

describe("calcularSaque", () => {
  it("saque normal: só vendas com 30 dias, com a comissão", () => {
    const saque = calcularSaque(lancamentos.slice(0, 3), agora, 10, false);
    expect(saque.lancamentoIds).toEqual(["madura"]);
    expect(saque.brutoCentavos).toBe(10_000);
    expect(saque.taxaCentavos).toBe(1_000);
    expect(saque.liquidoCentavos).toBe(9_000);
  });

  it("saque antecipado: inclui vendas de 1 a 30 dias com 1% a mais", () => {
    const saque = calcularSaque(lancamentos.slice(0, 3), agora, 10, true);
    expect(saque.lancamentoIds).toEqual(["madura", "antecipavel"]);
    expect(saque.antecipadoCentavos).toBe(5_000);
    // 10% de 10.000 + 11% de 5.000
    expect(saque.taxaCentavos).toBe(1_000 + 550);
    expect(saque.liquidoCentavos).toBe(15_000 - 1_550);
  });

  it("arredonda a taxa para baixo: o centavo fica com o fotógrafo", () => {
    const saque = calcularSaque([venda("x", 999, 40)], agora, 10, false);
    expect(saque.taxaCentavos).toBe(99);
    expect(saque.liquidoCentavos).toBe(900);
  });
});

describe("calcularSaldo", () => {
  it("separa disponível, antecipável e a liberar, ignorando o que já foi sacado", () => {
    const saldo = calcularSaldo(lancamentos, agora, 10);
    expect(saldo.disponivelCentavos).toBe(10_000);
    expect(saldo.antecipavelCentavos).toBe(5_000);
    expect(saldo.aLiberarCentavos).toBe(2_000);
  });
});
