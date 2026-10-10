import { describe, expect, it } from "vitest";

import type { Lancamento } from "@/dados/tipos";

import { aplicarLiberacao, calcularSaldo, calcularSaque, saqueSemPrazo } from "./saques";

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

  it("saque antecipado: inclui vendas de 1 a 30 dias com 2% a mais", () => {
    const saque = calcularSaque(lancamentos.slice(0, 3), agora, 8, true);
    expect(saque.lancamentoIds).toEqual(["madura", "antecipavel"]);
    expect(saque.antecipadoCentavos).toBe(5_000);
    // 8% de 10.000 + 10% de 5.000
    expect(saque.taxaCentavos).toBe(800 + 500);
    expect(saque.liquidoCentavos).toBe(15_000 - 1_300);
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

describe("liberação de teste (SAQUE_SEM_PRAZO_EMAILS)", () => {
  const gestor = { id: "u1", email: "Gestor@Exemplo.com", papel: "admin" as const };
  const contaDoGestor = { usuarioId: "u1" };
  const lista = " outro@exemplo.com , gestor@exemplo.com ";
  const hoje = [venda("hoje", 10_000, 0)];

  function saldoCom(
    usuario: Parameters<typeof saqueSemPrazo>[0],
    conta: Parameters<typeof saqueSemPrazo>[1],
    variavel: string | undefined,
  ) {
    const liberado = saqueSemPrazo(usuario, conta, variavel);
    return calcularSaldo(aplicarLiberacao(hoje, agora, liberado), agora, 10);
  }

  it("gestor na lista: venda de hoje fica disponível, com a comissão normal", () => {
    expect(saqueSemPrazo(gestor, contaDoGestor, lista)).toBe(true);
    const saldo = saldoCom(gestor, contaDoGestor, lista);
    expect(saldo.disponivelCentavos).toBe(10_000);
    expect(saldo.aLiberarCentavos).toBe(0);
    expect(saldo.normal.lancamentoIds).toEqual(["hoje"]);
    expect(saldo.normal.taxaCentavos).toBe(1_000);
    expect(saldo.normal.liquidoCentavos).toBe(9_000);
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
    expect(saldo.aLiberarCentavos).toBe(10_000);
  });

  it("outro fotógrafo: prazo normal", () => {
    const outro = { id: "u2", email: "fulano@exemplo.com", papel: "fotografo" as const };
    expect(saqueSemPrazo(outro, { usuarioId: "u2" }, lista)).toBe(false);
    expect(saldoCom(outro, { usuarioId: "u2" }, lista).disponivelCentavos).toBe(0);
    // Outro gestor fora da lista também não.
    const outroGestor = { ...outro, papel: "admin" as const };
    expect(saqueSemPrazo(outroGestor, { usuarioId: "u2" }, lista)).toBe(false);
  });

  it("conta de fotógrafo de outro usuário: não libera", () => {
    expect(saqueSemPrazo(gestor, { usuarioId: "u2" }, lista)).toBe(false);
  });
});
