import { describe, expect, it } from "vitest";

import { acrescimoCartao, acrescimoCartaoPct, parteDoVendedorNaTaxa, taxaCartaoPct } from "./taxas";

describe("taxa do cartão meio a meio", () => {
  it("acréscimo + parte do vendedor cobrem o Mercado Pago, a menos de 1 centavo da plataforma", () => {
    for (let itens = 1; itens <= 200_000; itens += 7) {
      const acrescimo = acrescimoCartao(itens, 4.98);
      const vendedor = parteDoVendedorNaTaxa(itens, 4.98);
      const taxaDoMercadoPago = ((itens + acrescimo) * 4.98) / 100;
      const sobra = acrescimo + vendedor - taxaDoMercadoPago;
      expect(sobra).toBeGreaterThan(-1);
      expect(sobra).toBeLessThan(1);
    }
  });

  it("a parte do vendedor é arredondada para baixo, em inteiros, sem erro de número decimal", () => {
    const casos: [number, number][] = [
      [1, 0], // R$ 0,01
      [10, 0],
      [40, 0], // 0,996 centavo
      [41, 1], // 1,0209 centavo
      [100, 2], // 2,49 centavos
      [1000, 24],
      [1990, 49],
      [2990, 74],
      [5000, 124], // 124,5 centavos
      [10_000, 249], // R$ 100: exatos R$ 2,49
      [20_000, 498],
      [30_000, 747],
      [100_000, 2490],
      [1_000_000, 24_900],
    ];
    for (const [valor, parte] of casos) expect(parteDoVendedorNaTaxa(valor, 4.98)).toBe(parte);
    expect(parteDoVendedorNaTaxa(0, 4.98)).toBe(0);
    expect(parteDoVendedorNaTaxa(-10, 4.98)).toBe(0);
    // Outra taxa do ambiente: 3,99% de R$ 100 é 199,5 centavos.
    expect(parteDoVendedorNaTaxa(10_000, 3.99)).toBe(199);
    expect(parteDoVendedorNaTaxa(10_000, 5)).toBe(250);
  });

  it("o total cobrado do comprador continua o mesmo", () => {
    expect(acrescimoCartao(1990, 4.98)).toBe(53);
    expect(acrescimoCartao(10_000, 4.98)).toBe(263);
    expect(acrescimoCartao(100, 4.98)).toBe(3);
  });

  it("nada do total pago fica sem dono: fotógrafo + cobertura da taxa fecham o total", () => {
    for (const itens of [1, 100, 1990, 5000, 10_000, 123_456]) {
      const acrescimo = acrescimoCartao(itens, 4.98);
      const parte = parteDoVendedorNaTaxa(itens, 4.98);
      expect(itens - parte + (acrescimo + parte)).toBe(itens + acrescimo);
      expect(parte).toBeLessThanOrEqual(itens);
    }
  });

  it("valores de exemplo com 4,98%", () => {
    expect(acrescimoCartao(1990, 4.98)).toBe(53); // R$ 19,90 vira R$ 20,43
    expect(parteDoVendedorNaTaxa(1990, 4.98)).toBe(49);
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
