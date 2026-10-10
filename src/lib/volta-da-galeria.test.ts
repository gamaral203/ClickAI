import { describe, expect, it } from "vitest";

import {
  esquecerOrigem,
  guardarOrigem,
  lerOrigem,
  trocarFotoAtual,
  veioDaGaleria,
} from "./volta-da-galeria";

function guardaFalsa() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  };
}

const T = 1_000_000;

describe("volta da foto para a galeria", () => {
  it("quem veio da galeria volta no histórico; quem abriu o link direto, não", () => {
    const g = guardaFalsa();
    expect(veioDaGaleria("corrida", "a", T, g)).toBe(false);
    guardarOrigem({ slug: "corrida", fotoAtual: "a", fotoClicada: "a" }, T, g);
    expect(veioDaGaleria("corrida", "a", T, g)).toBe(true);
    // Outra foto (link compartilhado aberto na mesma aba) ou outro evento: vai pelo link.
    expect(veioDaGaleria("corrida", "b", T, g)).toBe(false);
    expect(veioDaGaleria("festa", "a", T, g)).toBe(false);
  });

  it("Anterior/Próxima acompanham a foto aberta e mantêm a foto tocada", () => {
    const g = guardaFalsa();
    guardarOrigem({ slug: "corrida", fotoAtual: "a", fotoClicada: "a" }, T, g);
    trocarFotoAtual("corrida", "a", "b", T, g);
    expect(veioDaGaleria("corrida", "b", T, g)).toBe(true);
    expect(lerOrigem(T, g)?.fotoClicada).toBe("a");
    // Troca vinda de outra foto (sem origem correspondente) não mexe na origem.
    trocarFotoAtual("corrida", "x", "y", T, g);
    expect(veioDaGaleria("corrida", "b", T, g)).toBe(true);
  });

  it("ignora origem velha, inválida ou esquecida", () => {
    const g = guardaFalsa();
    guardarOrigem({ slug: "corrida", fotoAtual: "a", fotoClicada: "a" }, T, g);
    expect(lerOrigem(T + 31 * 60 * 1000, g)).toBeNull();
    esquecerOrigem(g);
    expect(lerOrigem(T, g)).toBeNull();
    g.setItem("clicouai:volta-da-galeria", "{quebrado");
    expect(lerOrigem(T, g)).toBeNull();
    expect(lerOrigem(T, null)).toBeNull();
  });

  it("sem espaço para as fotos, guarda ao menos de onde a pessoa saiu", () => {
    const g = guardaFalsa();
    let primeira = true;
    const cheia = {
      ...g,
      setItem: (k: string, v: string) => {
        if (primeira) {
          primeira = false;
          throw new Error("QuotaExceededError");
        }
        g.setItem(k, v);
      },
    };
    guardarOrigem(
      {
        slug: "corrida",
        fotoAtual: "a",
        fotoClicada: "a",
        galeria: { chave: "||", fotos: [], cursor: null },
      },
      T,
      cheia,
    );
    expect(veioDaGaleria("corrida", "a", T, g)).toBe(true);
    expect(lerOrigem(T, g)?.galeria).toBeUndefined();
  });
});
