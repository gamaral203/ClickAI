import { describe, expect, it } from "vitest";

import type { EventoResumo } from "@/dados/tipos";

import {
  DESTAQUES_NA_INICIAL,
  fotografosDaInicial,
  RECENTES_NA_INICIAL,
  separarEventosDaInicial,
} from "./selecao-inicio";

function evento(
  id: string,
  { fotografo = "f1", categoria = "Corridas", capa = true } = {},
): EventoResumo {
  return {
    id,
    fotografo: { id: fotografo, nomePublico: `Fotógrafo ${fotografo}`, slug: fotografo },
    categoria: { id: categoria, nome: categoria, slug: categoria },
    capaMiniatura: capa
      ? { urlMiniatura: `/${id}.webp`, urlPrevia: null, largura: 1, altura: 1 }
      : null,
  } as unknown as EventoResumo;
}

const ids = (lista: EventoResumo[]) => lista.map((e) => e.id);

describe("separarEventosDaInicial", () => {
  it("põe os mais vendidos da semana no destaque e não repete nos recentes", () => {
    const eventos = ["a", "b", "c"].map((id) => evento(id));
    const { destaques, recentes } = separarEventosDaInicial(eventos, [
      ["c", 5],
      ["x", 3],
    ]);
    expect(ids(destaques)).toEqual(["c"]);
    expect(ids(recentes)).toEqual(["a", "b"]);
  });

  it("com poucos eventos, não completa o destaque", () => {
    const eventos = ["a", "b", "c", "d", "e"].map((id) => evento(id));
    const { destaques, recentes } = separarEventosDaInicial(eventos, []);
    expect(destaques).toEqual([]);
    expect(ids(recentes)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("com eventos suficientes, completa o destaque com os recentes que têm capa", () => {
    const eventos = [
      evento("a", { capa: false }),
      ...["b", "c", "d", "e", "f", "g"].map((id) => evento(id)),
    ];
    const { destaques, recentes } = separarEventosDaInicial(eventos, [["f", 2]]);
    expect(ids(destaques)).toEqual(["f", "b", "c", "d"]);
    expect(destaques).toHaveLength(DESTAQUES_NA_INICIAL);
    expect(ids(recentes)).toEqual(["a", "e", "g"]);
  });

  it("limita os recentes", () => {
    const eventos = Array.from({ length: 20 }, (_, i) => evento(`e${i}`));
    expect(separarEventosDaInicial(eventos, []).recentes).toHaveLength(RECENTES_NA_INICIAL);
  });
});

describe("fotografosDaInicial", () => {
  it("lista cada fotógrafo uma vez, pelo evento mais recente, com as categorias mais frequentes", () => {
    const eventos = [
      evento("a", { fotografo: "f2", categoria: "Festas" }),
      evento("b", { fotografo: "f1", categoria: "Corridas" }),
      evento("c", { fotografo: "f2", categoria: "Casamentos" }),
      evento("d", { fotografo: "f2", categoria: "Casamentos" }),
      evento("e", { fotografo: "f2", categoria: "Esportes" }),
    ];
    const lista = fotografosDaInicial(eventos);
    expect(lista.map((f) => f.fotografo.id)).toEqual(["f2", "f1"]);
    expect(lista[0].especialidades).toEqual(["Casamentos", "Festas"]);
    expect(lista[1].especialidades).toEqual(["Corridas"]);
  });
});
