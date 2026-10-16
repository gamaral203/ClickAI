import { describe, expect, it } from "vitest";

import {
  aplicarAjustesDaMarca,
  CONFIG_MARCA_PADRAO,
  esquemaAjustesMarca,
  LIMITES_MARCA,
} from "./protecao-previas";

describe("ajustes da marca do fotógrafo", () => {
  it("sem ajustes, vale a configuração da gestão", () => {
    expect(aplicarAjustesDaMarca(CONFIG_MARCA_PADRAO, null)).toEqual(CONFIG_MARCA_PADRAO);
  });

  it("os ajustes mudam só tamanho, quantidade e opacidade", () => {
    const r = aplicarAjustesDaMarca(CONFIG_MARCA_PADRAO, {
      tamanhoPct: 140,
      quantidade: 30,
      opacidadePct: 60,
    });
    expect(r).toEqual({
      ...CONFIG_MARCA_PADRAO,
      tamanhoPct: 140,
      quantidade: 30,
      opacidadePct: 60,
    });
  });

  it("um campo vazio fica com o da gestão, e nada passa dos limites", () => {
    const r = aplicarAjustesDaMarca(CONFIG_MARCA_PADRAO, {
      tamanhoPct: null,
      quantidade: 999,
      opacidadePct: 1,
    });
    expect(r.tamanhoPct).toBe(CONFIG_MARCA_PADRAO.tamanhoPct);
    expect(r.quantidade).toBe(LIMITES_MARCA.quantidade.max);
    // O piso de proteção: a marca nunca some.
    expect(r.opacidadePct).toBe(LIMITES_MARCA.opacidadePct.min);
  });

  it("a validação recusa valores fora dos limites", () => {
    expect(
      esquemaAjustesMarca.safeParse({ tamanhoPct: 100, quantidade: 20, opacidadePct: 10 }).success,
    ).toBe(false);
    expect(
      esquemaAjustesMarca.safeParse({ tamanhoPct: 100, quantidade: 20, opacidadePct: 50 }).success,
    ).toBe(true);
  });
});
