import { describe, expect, it } from "vitest";

import { acrescimoCartao, acrescimoCartaoPct, parteDoVendedorNaTaxa, taxaCartaoPct } from "./taxas";

describe("taxa do cartão meio a meio", () => {
  it("a plataforma nunca paga a taxa: acréscimo + parte do vendedor cobrem o Mercado Pago", () => {
    for (const itens of [100, 1990, 2990, 10_000, 123_456, 999_999]) {
      const acrescimo = acrescimoCartao(itens, 4.98);
      const vendedor = parteDoVendedorNaTaxa(itens, 4.98);
      const taxaDoMercadoPago = ((itens + acrescimo) * 4.98) / 100;
      expect(acrescimo + vendedor).toBeGreaterThanOrEqual(taxaDoMercadoPago);
      // E sem cobrar demais: a sobra é de no máximo 2 centavos (arredondamentos).
      expect(acrescimo + vendedor - taxaDoMercadoPago).toBeLessThan(2.01);
    }
  });

  it("valores de exemplo com 4,98%", () => {
    expect(acrescimoCartao(1990, 4.98)).toBe(53); // R$ 19,90 vira R$ 20,43
    expect(parteDoVendedorNaTaxa(1990, 4.98)).toBe(50);
    expect(acrescimoCartaoPct(4.98).toFixed(2)).toBe("2.62");
    expect(acrescimoCartao(0, 4.98)).toBe(0);
  });

  it("lê a taxa do ambiente, com 4,98% de padrão", () => {
    expect(taxaCartaoPct(undefined)).toBe(4.98);
    expect(taxaCartaoPct("3.99")).toBe(3.99);
    expect(taxaCartaoPct("lixo")).toBe(4.98);
    expect(taxaCartaoPct("50")).toBe(4.98);
  });
});
