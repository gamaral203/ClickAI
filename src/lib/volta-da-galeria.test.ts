import { describe, expect, it } from "vitest";

import {
  esquecerOrigem,
  fotoParaRolar,
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
/** Fotos da página da galeria que estava na tela. */
const PAGINA = ["a", "b", "c"];

describe("volta da foto para a galeria", () => {
  it("quem veio da galeria volta no histórico; quem abriu o link direto, não", () => {
    const g = guardaFalsa();
    expect(veioDaGaleria("corrida", "a", T, g)).toBe(false);
    guardarOrigem({ slug: "corrida", fotoAtual: "a", ids: PAGINA }, T, g);
    expect(veioDaGaleria("corrida", "a", T, g)).toBe(true);
    // Outra foto (link compartilhado aberto na mesma aba) ou outro evento: vai pelo link.
    expect(veioDaGaleria("corrida", "x", T, g)).toBe(false);
    expect(veioDaGaleria("festa", "a", T, g)).toBe(false);
  });

  it("Anterior/Próxima na mesma página voltam no histórico; ao atravessar a página, pelo link", () => {
    const g = guardaFalsa();
    guardarOrigem({ slug: "corrida", fotoAtual: "b", ids: PAGINA }, T, g);
    trocarFotoAtual("corrida", "b", "c", T, g);
    expect(veioDaGaleria("corrida", "c", T, g)).toBe(true);
    // "Próxima" da última foto da página leva à primeira da página seguinte: o voltar do
    // histórico mostraria a página antiga, então vai pelo link da página certa.
    trocarFotoAtual("corrida", "c", "d", T, g);
    expect(veioDaGaleria("corrida", "d", T, g)).toBe(false);
    // Troca vinda de outra foto (sem origem correspondente) não mexe na origem.
    trocarFotoAtual("corrida", "x", "y", T, g);
    expect(lerOrigem(T, g)?.fotoAtual).toBe("d");
  });

  it("a galeria rola até a foto aberta só se ela está na tela, e consome a origem", () => {
    const g = guardaFalsa();
    guardarOrigem({ slug: "corrida", fotoAtual: "d", ids: PAGINA }, T, g);
    // A lista da busca aparece antes e não tem a foto: não consome.
    expect(fotoParaRolar("corrida", ["z"], T, g)).toBeNull();
    expect(fotoParaRolar("festa", ["d"], T, g)).toBeNull();
    // A página seguinte da galeria tem a foto: rola até ela e esquece.
    expect(fotoParaRolar("corrida", ["d", "e"], T, g)).toBe("d");
    expect(lerOrigem(T, g)).toBeNull();
    expect(fotoParaRolar("corrida", ["d", "e"], T, g)).toBeNull();
  });

  it("origem sem fotos na tela não volta no histórico, mas ainda rola até a foto", () => {
    const g = guardaFalsa();
    guardarOrigem({ slug: "corrida", fotoAtual: "a", ids: [] }, T, g);
    expect(veioDaGaleria("corrida", "a", T, g)).toBe(false);
    expect(fotoParaRolar("corrida", PAGINA, T, g)).toBe("a");
  });

  it("ignora origem velha, inválida, do formato antigo ou esquecida", () => {
    const g = guardaFalsa();
    guardarOrigem({ slug: "corrida", fotoAtual: "a", ids: PAGINA }, T, g);
    expect(lerOrigem(T + 31 * 60 * 1000, g)).toBeNull();
    esquecerOrigem(g);
    expect(lerOrigem(T, g)).toBeNull();
    g.setItem("clicouai:volta-da-galeria", "{quebrado");
    expect(lerOrigem(T, g)).toBeNull();
    // Formato do "Carregar mais" (sem `ids`), guardado antes desta versão.
    g.setItem(
      "clicouai:volta-da-galeria",
      JSON.stringify({ slug: "corrida", fotoAtual: "a", fotoClicada: "a", em: T }),
    );
    expect(lerOrigem(T, g)).toBeNull();
    expect(lerOrigem(T, null)).toBeNull();
  });

  it("sem sessionStorage (ou sem espaço), não quebra: o Voltar cai no link", () => {
    const cheia = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(() =>
      guardarOrigem({ slug: "corrida", fotoAtual: "a", ids: PAGINA }, T, cheia),
    ).not.toThrow();
    expect(veioDaGaleria("corrida", "a", T, cheia)).toBe(false);
  });
});
