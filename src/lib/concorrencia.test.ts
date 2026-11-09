import { describe, expect, it } from "vitest";

import { emLotes, emParalelo, esperaDaTentativa, Orcamento } from "./concorrencia";

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

describe("Orcamento.reservarAte", () => {
  it("espera a vez até o prazo; passou dele, sai da fila sem reservar nada", async () => {
    const orcamento = new Orcamento(2);
    const a = await orcamento.reservarAte(1, Date.now() + 1000);
    const b = await orcamento.reservarAte(1, Date.now() + 1000);
    expect(a && b).toBeTruthy();
    // Cheio: desiste no prazo e não fica reservado.
    expect(await orcamento.reservarAte(1, Date.now() + 30)).toBeNull();
    expect(orcamento.emUso).toBe(2);
    // Prazo já vencido: nem tenta, mesmo com vaga.
    a!();
    expect(await orcamento.reservarAte(1, Date.now() - 1)).toBeNull();
    expect(orcamento.emUso).toBe(1);
    // Quem espera dentro do prazo entra quando alguém libera.
    const esperando = orcamento.reservarAte(2, Date.now() + 1000);
    setTimeout(() => b!(), 20);
    const c = await esperando;
    expect(c).toBeTruthy();
    expect(orcamento.emUso).toBe(2);
    c!();
    expect(orcamento.emUso).toBe(0);
  });

  it("quem desistiu na frente da fila não prende quem cabe atrás", async () => {
    const orcamento = new Orcamento(3);
    const grande = await orcamento.reservar(2);
    const desiste = orcamento.reservarAte(3, Date.now() + 20);
    const pequeno = orcamento.reservar(1);
    expect(await desiste).toBeNull();
    const soltar = await pequeno;
    expect(orcamento.emUso).toBe(3);
    soltar();
    grande();
    expect(orcamento.emUso).toBe(0);
  });
});
