import { describe, expect, it } from "vitest";

import { dividirItem } from "./pedidos";

const regra = { fotoId: "f", autorId: "autor", donoEventoId: "dono", comissaoDonoPct: 30 };

describe("dividirItem", () => {
  it("dá tudo ao autor quando ele é o dono do evento", () => {
    expect(dividirItem(1990, { ...regra, autorId: "dono" })).toEqual({
      valorDonoEventoCentavos: 0,
      valorFotografoCentavos: 1990,
    });
  });

  it("dá a comissão ao dono e a sobra de centavos ao autor", () => {
    // 30% de 1999 = 599,7: o dono fica com 599 e o autor com 1400.
    expect(dividirItem(1999, regra)).toEqual({
      valorDonoEventoCentavos: 599,
      valorFotografoCentavos: 1400,
    });
  });

  it("sempre fecha com o preço", () => {
    for (let preco = 0; preco < 5000; preco += 37) {
      const { valorDonoEventoCentavos, valorFotografoCentavos } = dividirItem(preco, regra);
      expect(valorDonoEventoCentavos + valorFotografoCentavos).toBe(preco);
    }
  });
});
