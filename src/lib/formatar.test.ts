import { describe, expect, it } from "vitest";

import { formatarPrecoCompacto, seloDeData } from "./formatar";

describe("formatarPrecoCompacto", () => {
  it("abaixo de R$ 1.000, mostra os reais sem centavos", () => {
    expect(formatarPrecoCompacto(0)).toBe("R$ 0");
    expect(formatarPrecoCompacto(99)).toBe("R$ 0");
    expect(formatarPrecoCompacto(700_00)).toBe("R$ 700");
    expect(formatarPrecoCompacto(999_99)).toBe("R$ 999");
  });

  it("de R$ 1.000 a R$ 999.999, em mil, com uma casa só quando não é inteiro", () => {
    expect(formatarPrecoCompacto(1_000_00)).toBe("R$ 1 mil");
    expect(formatarPrecoCompacto(2_500_00)).toBe("R$ 2,5 mil");
    expect(formatarPrecoCompacto(10_000_00)).toBe("R$ 10 mil");
    expect(formatarPrecoCompacto(12_345_00)).toBe("R$ 12,3 mil");
    expect(formatarPrecoCompacto(250_000_00)).toBe("R$ 250 mil");
  });

  it("arredonda para baixo: nunca mostra mais do que o valor", () => {
    expect(formatarPrecoCompacto(9_999_99)).toBe("R$ 9,9 mil");
    expect(formatarPrecoCompacto(999_999_99)).toBe("R$ 999,9 mil");
    expect(formatarPrecoCompacto(1_299_999_99)).toBe("R$ 1,2 mi");
  });

  it("a partir de R$ 1 milhão, em mi", () => {
    expect(formatarPrecoCompacto(1_000_000_00)).toBe("R$ 1 mi");
    expect(formatarPrecoCompacto(1_200_000_00)).toBe("R$ 1,2 mi");
    expect(formatarPrecoCompacto(15_000_000_00)).toBe("R$ 15 mi");
  });

  it("valor negativo leva o sinal na frente", () => {
    expect(formatarPrecoCompacto(-2_500_00)).toBe("-R$ 2,5 mil");
  });
});

describe("seloDeData", () => {
  it("dá o dia e o mês abreviado, sem ponto, no horário de Brasília", () => {
    expect(seloDeData("2026-10-07T12:00:00Z")).toEqual({ dia: "7", mes: "out" });
    // 01:00 UTC do dia 1º ainda é dia 31 no horário de Brasília.
    expect(seloDeData("2026-11-01T01:00:00Z")).toEqual({ dia: "31", mes: "out" });
  });
});
