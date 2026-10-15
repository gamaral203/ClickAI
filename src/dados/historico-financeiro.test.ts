import { describe, expect, it } from "vitest";

import {
  filtrarHistorico,
  inicioDoPeriodo,
  lerFiltrosDoHistorico,
  montarHistorico,
  type LinhaDeLancamento,
  type LinhaDoHistorico,
} from "./historico-financeiro";
import type { LancamentoDoExtrato } from "./painel";
import type { MetodoPagamento, Saque } from "./tipos";

// Histórico financeiro: cada venda com bruto, comissão de 8%, antecipação (1,99% só no cartão
// liberado antes dos 30 dias) e líquido; transferências como linhas próprias; filtros da URL.

const DIA = 24 * 60 * 60 * 1000;
// 15/10/2026 12:00 em Brasília.
const agora = Date.UTC(2026, 9, 15, 15);
const conta = { comissaoPct: 8, anteciparCartao: false, ultimaTransferenciaAutomaticaEm: null };

/** Venda paga `dias` atrás, como lancamentosDaVenda grava: Pix em 1 dia, cartão em 30. */
function venda(
  id: string,
  valorCentavos: number,
  dias: number,
  metodo: MetodoPagamento,
  extra: Partial<LancamentoDoExtrato> = {},
): LancamentoDoExtrato {
  const pagoEm = agora - dias * DIA;
  return {
    id,
    fotografoId: "f",
    itemPedidoId: `item-${id}`,
    valorCentavos,
    disponivelEm: new Date(pagoEm + (metodo === "pix" ? DIA : 30 * DIA)).toISOString(),
    antecipavelEm: new Date(pagoEm + DIA).toISOString(),
    saqueId: null,
    estornoDe: null,
    eventoTitulo: "Corrida",
    pagoEm: new Date(pagoEm).toISOString(),
    valorPagoCentavos: valorCentavos,
    papel: "autor",
    metodo,
    ...extra,
  };
}

function saque(id: string, diasAtras: number, extra: Partial<Saque> = {}): Saque {
  return {
    id,
    fotografoId: "f",
    antecipado: false,
    brutoCentavos: 10_000,
    taxaCentavos: 800,
    comissaoCentavos: 800,
    taxaAntecipacaoCentavos: 0,
    liquidoCentavos: 9_200,
    chavePix: "12345678909",
    gatewayId: null,
    status: "pago",
    criadoEm: new Date(agora - diasAtras * DIA).toISOString(),
    pagoEm: new Date(agora - diasAtras * DIA + 3_600_000).toISOString(),
    ...extra,
  };
}

const linha = (linhas: LinhaDoHistorico[], id: string) =>
  linhas.find((l) => l.id === id) as LinhaDeLancamento;

describe("valores e status de cada venda", () => {
  it("Pix de R$ 100: comissão de R$ 8, sem antecipação, disponível em 1 dia", () => {
    const linhas = montarHistorico(
      [venda("hoje", 10_000, 0.5, "pix"), venda("ontem", 10_000, 2, "pix")],
      [],
      { ...conta, anteciparCartao: true },
      agora,
    );
    expect(linha(linhas, "hoje")).toMatchObject({
      tipo: "venda",
      brutoCentavos: 10_000,
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 0,
      liquidoCentavos: 9_200,
      status: "a_receber",
      previsto: true,
      transferidoEm: null,
    });
    expect(linha(linhas, "ontem").status).toBe("disponivel");
    expect(linha(linhas, "ontem").disponivelEm).toBe(venda("ontem", 1, 2, "pix").antecipavelEm);
  });

  it("cartão sem antecipação: 30 dias, sem taxa", () => {
    const linhas = montarHistorico([venda("c", 10_000, 5, "cartao")], [], conta, agora);
    expect(linha(linhas, "c")).toMatchObject({
      taxaAntecipacaoCentavos: 0,
      liquidoCentavos: 9_200,
      status: "a_receber",
      disponivelEm: venda("c", 1, 5, "cartao").disponivelEm,
    });
  });

  it("cartão com antecipação ligada: 1,99% previsto e disponível em 1 dia", () => {
    const linhas = montarHistorico(
      [venda("c", 10_000, 5, "cartao"), venda("velho", 10_000, 40, "cartao")],
      [],
      { ...conta, anteciparCartao: true },
      agora,
    );
    expect(linha(linhas, "c")).toMatchObject({
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 199,
      liquidoCentavos: 9_001,
      status: "disponivel",
      previsto: true,
      disponivelEm: venda("c", 1, 5, "cartao").antecipavelEm,
    });
    // Já com 30 dias: não paga antecipação nem com ela ligada.
    expect(linha(linhas, "velho").taxaAntecipacaoCentavos).toBe(0);
  });

  it("transferido: a taxa é a que o saque cobrou, não a configuração atual", () => {
    const antecipado = saque("s1", 20, {
      antecipado: true,
      taxaAntecipacaoCentavos: 199,
      taxaCentavos: 999,
      liquidoCentavos: 9_001,
    });
    const semTaxa = saque("s2", 5);
    const linhas = montarHistorico(
      [
        // Cartão de 25 dias atrás que entrou no saque de 20 dias atrás (antes dos 30): 1,99%.
        venda("cedo", 10_000, 25, "cartao", { saqueId: "s1" }),
        // Cartão que esperou os 30 dias: sem taxa, mesmo com a antecipação ligada hoje.
        venda("maduro", 10_000, 40, "cartao", { saqueId: "s2" }),
        venda("pix", 10_000, 25, "pix", { saqueId: "s1" }),
      ],
      [antecipado, semTaxa],
      { ...conta, anteciparCartao: true },
      agora,
    );
    expect(linha(linhas, "cedo")).toMatchObject({
      taxaAntecipacaoCentavos: 199,
      liquidoCentavos: 9_001,
      status: "transferido",
      previsto: false,
      transferidoEm: antecipado.pagoEm,
    });
    expect(linha(linhas, "maduro")).toMatchObject({
      taxaAntecipacaoCentavos: 0,
      status: "transferido",
      disponivelEm: venda("maduro", 1, 40, "cartao").disponivelEm,
    });
    // Pix no saque que cobrou antecipação: o Pix nunca paga 1,99%.
    expect(linha(linhas, "pix").taxaAntecipacaoCentavos).toBe(0);
  });

  it("em transferência enquanto o saque está processando; saque que falhou não conta", () => {
    const linhas = montarHistorico(
      [
        venda("a", 10_000, 10, "pix", { saqueId: "proc" }),
        venda("b", 10_000, 10, "pix", { saqueId: "falho" }),
      ],
      [
        saque("proc", 1, { status: "processando", pagoEm: null }),
        saque("falho", 2, { status: "falhou", pagoEm: null }),
      ],
      conta,
      agora,
    );
    expect(linha(linhas, "a")).toMatchObject({ status: "em_transferencia", transferidoEm: null });
    expect(linha(linhas, "b")).toMatchObject({ status: "disponivel", previsto: true });
  });

  it("estorno: linha negativa, comissão devolvida e a venda marcada como estornada", () => {
    const original = venda("v", 10_000, 3, "pix");
    const estorno = { ...original, id: "e", valorCentavos: -10_000, estornoDe: "v" };
    const linhas = montarHistorico([original, estorno], [], conta, agora);
    expect(linha(linhas, "v").status).toBe("estornado");
    expect(linha(linhas, "e")).toMatchObject({
      tipo: "estorno",
      brutoCentavos: -10_000,
      comissaoCentavos: -800,
      liquidoCentavos: -9_200,
      status: "estornado",
    });
    // Somados, venda e estorno se anulam: o líquido do fotógrafo não muda.
    const soma = linhas.reduce((s, l) => s + l.liquidoCentavos, 0);
    expect(soma).toBe(0);
  });
});

describe("transferências", () => {
  it("viram linhas com o líquido, a data do pedido, a do Pix e se foram automáticas", () => {
    const auto = saque("auto", 3);
    const manual = saque("manual", 10);
    const linhas = montarHistorico(
      [],
      [auto, manual, saque("falhou", 1, { status: "falhou", pagoEm: null })],
      { ...conta, ultimaTransferenciaAutomaticaEm: auto.criadoEm },
      agora,
    );
    expect(linhas.map((l) => l.id)).toEqual(["falhou", "auto", "manual"]);
    expect(linhas[1]).toMatchObject({
      tipo: "transferencia",
      liquidoCentavos: 9_200,
      data: auto.criadoEm,
      transferidoEm: auto.pagoEm,
      status: "transferido",
      automatica: true,
    });
    expect(linhas[2]).toMatchObject({ automatica: null });
    expect(linhas[0]).toMatchObject({ status: "nao_realizada" });
  });
});

describe("filtros", () => {
  const linhas = montarHistorico(
    [
      venda("pix-recente", 1_000, 2, "pix"),
      venda("cartao-mes", 1_000, 10, "cartao"),
      venda("pix-antigo", 1_000, 60, "pix"),
      {
        ...venda("pix-recente", 1_000, 2, "pix"),
        id: "estorno",
        valorCentavos: -1_000,
        estornoDe: "pix-recente",
      },
    ],
    [saque("s", 20)],
    conta,
    agora,
  );

  it("lê os parâmetros h_ com Zod e cai no padrão com valor inválido", () => {
    expect(lerFiltrosDoHistorico({})).toEqual({ periodo: "tudo", tipo: "todos", pagina: 1 });
    expect(
      lerFiltrosDoHistorico({ h_periodo: "30", h_tipo: ["cartao", "pix"], h_pagina: "3" }),
    ).toEqual({ periodo: "30", tipo: "cartao", pagina: 3 });
    expect(
      lerFiltrosDoHistorico({ h_periodo: "365", h_tipo: "boleto", h_pagina: "-2", periodo: "x" }),
    ).toEqual({ periodo: "tudo", tipo: "todos", pagina: 1 });
  });

  it("por período (7, 30, 90 dias, este mês, tudo)", () => {
    const ids = (periodo: "7" | "30" | "90" | "mes" | "tudo") =>
      filtrarHistorico(linhas, { periodo, tipo: "todos", pagina: 1 }, agora).linhas.map(
        (l) => l.id,
      );
    expect(ids("7").sort()).toEqual(["estorno", "pix-recente"]);
    expect(ids("30").sort()).toEqual(["cartao-mes", "estorno", "pix-recente", "s"]);
    expect(ids("90")).toHaveLength(5);
    expect(ids("tudo")).toHaveLength(5);
    // Outubro em Brasília: de 1º/10 00:00 (−03:00) até agora.
    expect(inicioDoPeriodo("mes", agora)).toBe(Date.parse("2026-10-01T00:00:00-03:00"));
    expect(ids("mes").sort()).toEqual(["cartao-mes", "estorno", "pix-recente"]);
  });

  it("por tipo (Pix, Cartão, Estorno, Transferência)", () => {
    const ids = (tipo: "pix" | "cartao" | "estorno" | "transferencia") =>
      filtrarHistorico(linhas, { periodo: "tudo", tipo, pagina: 1 }, agora).linhas.map((l) => l.id);
    expect(ids("pix")).toEqual(["pix-recente", "pix-antigo"]);
    expect(ids("cartao")).toEqual(["cartao-mes"]);
    expect(ids("estorno")).toEqual(["estorno"]);
    expect(ids("transferencia")).toEqual(["s"]);
  });

  it("pagina e segura a página além da última", () => {
    const filtros = { periodo: "tudo" as const, tipo: "todos" as const, pagina: 2 };
    expect(filtrarHistorico(linhas, filtros, agora, 2)).toMatchObject({
      total: 5,
      pagina: 2,
      paginas: 3,
    });
    expect(filtrarHistorico(linhas, filtros, agora, 2).linhas).toHaveLength(2);
    const alem = filtrarHistorico(linhas, { ...filtros, pagina: 99 }, agora, 2);
    expect(alem).toMatchObject({ pagina: 3, paginas: 3 });
    expect(alem.linhas).toHaveLength(1);
  });
});
