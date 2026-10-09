import { describe, expect, it } from "vitest";

import { humorDoPainel, pedidosPorSemana } from "./recepcao";

describe("recepção do painel", () => {
  it("sem evento publicado, dá boas-vindas", () => {
    expect(humorDoPainel({ publicados: 0, pedidosSemana: 5, pedidosSemanaAnterior: 0 })).toBe(
      "novo",
    );
  });

  it("vendeu e não caiu em relação à semana anterior: em alta", () => {
    expect(humorDoPainel({ publicados: 2, pedidosSemana: 3, pedidosSemanaAnterior: 3 })).toBe(
      "alta",
    );
    expect(humorDoPainel({ publicados: 2, pedidosSemana: 4, pedidosSemanaAnterior: 1 })).toBe(
      "alta",
    );
  });

  it("sem venda, ou vendendo menos que antes: movimento baixo", () => {
    expect(humorDoPainel({ publicados: 1, pedidosSemana: 0, pedidosSemanaAnterior: 0 })).toBe(
      "baixo",
    );
    expect(humorDoPainel({ publicados: 1, pedidosSemana: 1, pedidosSemanaAnterior: 5 })).toBe(
      "baixo",
    );
  });

  it("soma as duas semanas a partir da série diária", () => {
    const serie = Array.from({ length: 30 }, (_, i) => ({
      pedidos: i >= 23 ? 2 : i >= 16 ? 1 : 0,
    }));
    expect(pedidosPorSemana(serie)).toEqual({ pedidosSemana: 14, pedidosSemanaAnterior: 7 });
  });
});
