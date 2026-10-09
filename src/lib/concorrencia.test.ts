import { describe, expect, it } from "vitest";

import { emLotes, emParalelo, esperaDaTentativa } from "./concorrencia";

describe("emParalelo", () => {
  it("nunca passa do limite e devolve na ordem dos itens", async () => {
    let rodando = 0;
    let pico = 0;
    const itens = Array.from({ length: 40 }, (_, i) => i);
    const r = await emParalelo(itens, 6, async (n) => {
      rodando++;
      pico = Math.max(pico, rodando);
      await new Promise((ok) => setTimeout(ok, (n * 7) % 5));
      rodando--;
      return n * 2;
    });
    expect(pico).toBe(6);
    expect(r.map((x) => (x.ok ? x.valor : null))).toEqual(itens.map((n) => n * 2));
  });

  it("um erro não para a fila", async () => {
    const r = await emParalelo([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error("falhou");
      return n;
    });
    expect(r.map((x) => x.ok)).toEqual([true, false, true, true]);
  });

  it("lista vazia e limite inválido", async () => {
    expect(await emParalelo([], 4, async () => 1)).toEqual([]);
    expect(await emParalelo([1, 2], 0, async (n) => n)).toHaveLength(2);
  });
});

describe("esperaDaTentativa e emLotes", () => {
  it("dobra a espera a cada tentativa, até o máximo", () => {
    const meio = () => 0.5;
    expect([1, 2, 3, 4, 10].map((n) => esperaDaTentativa(n, 1000, 15_000, meio))).toEqual([
      1000, 2000, 4000, 8000, 15_000,
    ]);
  });

  it("divide 3.000 fotos em lotes de 50", () => {
    const lotes = emLotes(
      Array.from({ length: 3001 }, (_, i) => i),
      50,
    );
    expect(lotes).toHaveLength(61);
    expect(lotes.at(-1)).toEqual([3000]);
    expect(lotes.flat()).toHaveLength(3001);
  });
});
