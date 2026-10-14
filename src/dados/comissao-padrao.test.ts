import { describe, expect, it } from "vitest";

import { comissaoPadraoPct, criarContaDeFotografo } from "@/dados";

describe("comissaoPadraoPct", () => {
  it("é a comissão com que a conta de fotógrafo nasce (a página inicial mostra este número)", async () => {
    // Ana (cliente de exemplo) ainda não tem conta de fotógrafo.
    const conta = await criarContaDeFotografo({
      usuarioId: "05e70000-0000-4000-8000-000000000004",
      nomePublico: "Ana Souza",
      slug: "ana-souza-comissao",
    });
    expect(comissaoPadraoPct()).toBeGreaterThan(0);
    expect(conta.comissaoPct).toBe(comissaoPadraoPct());
  });
});
