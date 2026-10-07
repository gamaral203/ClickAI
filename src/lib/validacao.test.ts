import { describe, expect, it } from "vitest";

import { lerFiltroEventos, lerFiltroGaleria } from "./validacao";

describe("lerFiltroEventos", () => {
  it("lê busca, data, categoria e cidade", () => {
    expect(
      lerFiltroEventos({
        busca: " corrida ",
        data: "2026-09-27",
        categoria: "corrida",
        cidade: "São Paulo",
      }),
    ).toEqual({ busca: "corrida", data: "2026-09-27", categoria: "corrida", cidade: "São Paulo" });
  });

  it("valor inválido vira sem filtro", () => {
    expect(
      lerFiltroEventos({ data: "27/09/2026", categoria: "<script>", cidade: "x".repeat(200) }),
    ).toEqual({ busca: undefined, data: undefined, categoria: undefined, cidade: undefined });
  });
});

describe("lerFiltroGaleria", () => {
  it("lê a hora cheia e as não identificadas", () => {
    expect(lerFiltroGaleria({ hora: "2026-09-27T07", "nao-identificadas": "1" })).toEqual({
      hora: "2026-09-27T07",
      naoIdentificadas: true,
    });
  });

  it("ignora formato errado", () => {
    expect(lerFiltroGaleria({ hora: "07h", "nao-identificadas": "sim" })).toEqual({
      hora: undefined,
      naoIdentificadas: undefined,
    });
  });
});
