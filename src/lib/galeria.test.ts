import { describe, expect, it } from "vitest";

import { enderecoDaGaleria, limitarPagina, paginaDaPosicao, paginasVisiveis } from "./galeria";
import { lerPagina } from "./validacao";

describe("componente de páginas (reticências)", () => {
  it("no meio: 1 … 4 5 6 7 8 … 80", () => {
    expect(paginasVisiveis(6, 80)).toEqual([1, "…", 4, 5, 6, 7, 8, "…", 80]);
  });

  it("nas pontas não repete números nem põe reticências à toa", () => {
    expect(paginasVisiveis(1, 80)).toEqual([1, 2, 3, "…", 80]);
    expect(paginasVisiveis(80, 80)).toEqual([1, "…", 78, 79, 80]);
    expect(paginasVisiveis(1, 1)).toEqual([1]);
    expect(paginasVisiveis(2, 3)).toEqual([1, 2, 3]);
    expect(paginasVisiveis(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("buraco de uma página só mostra o número", () => {
    // 1 _2_ 3 4 5: o 2 aparece em vez de "…".
    expect(paginasVisiveis(5, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, "…", 10]);
    expect(paginasVisiveis(6, 10)).toEqual([1, "…", 4, 5, 6, 7, 8, 9, 10]);
  });

  it("página fora do intervalo é levada para dentro", () => {
    expect(paginasVisiveis(99, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(limitarPagina(0, 5)).toBe(1);
    expect(limitarPagina(9, 5)).toBe(5);
    expect(limitarPagina(Number.NaN, 5)).toBe(1);
    expect(limitarPagina(3, 0)).toBe(1);
  });
});

describe("endereço e página da foto", () => {
  it("página 1 sem ?pagina; filtros mantidos; âncora na galeria", () => {
    expect(enderecoDaGaleria("corrida")).toBe("/eventos/corrida#galeria");
    expect(enderecoDaGaleria("corrida", {}, { pagina: 1 })).toBe("/eventos/corrida#galeria");
    expect(enderecoDaGaleria("corrida", { hora: "2026-10-10T07" }, { pagina: 3 })).toBe(
      "/eventos/corrida?hora=2026-10-10T07&pagina=3#galeria",
    );
    expect(enderecoDaGaleria("corrida", {}, { pagina: 2, ancora: false })).toBe(
      "/eventos/corrida?pagina=2",
    );
    expect(enderecoDaGaleria("corrida", {}, { pagina: 2, ancora: "foto-abc" })).toBe(
      "/eventos/corrida?pagina=2#foto-abc",
    );
  });

  it("posição → página (48 por página)", () => {
    expect(paginaDaPosicao(1)).toBe(1);
    expect(paginaDaPosicao(48)).toBe(1);
    expect(paginaDaPosicao(49)).toBe(2);
    expect(paginaDaPosicao(3829)).toBe(80);
  });

  it("?pagina na URL: só inteiro positivo; o resto vira 1", () => {
    expect(lerPagina("6")).toBe(6);
    expect(lerPagina(["3", "9"])).toBe(3);
    for (const ruim of [undefined, "", "0", "-2", "1.5", "abc", "1e3", "9999999", " 2"]) {
      expect(lerPagina(ruim)).toBe(1);
    }
  });
});
