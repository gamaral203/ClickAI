import { describe, expect, it } from "vitest";

import { avisosDoRanking, rotuloDoColega } from "./ranking-avisos";

const r = (...lista: [string, number][]) =>
  lista.map(([fotografoId, vendidas]) => ({ fotografoId, vendidas }));

describe("avisos do ranking da equipe", () => {
  it("quem passou do 2º para o 1º avisa o antigo líder e vira líder", () => {
    // Antes: Ana 5, Daniel 4. Daniel vendeu 2: Daniel 6, Ana 5.
    const avisos = avisosDoRanking(r(["daniel", 6], ["ana", 5]), new Map([["daniel", 2]]));
    expect(avisos).toEqual([
      { fotografoId: "daniel", tipo: "voce_lider" },
      { fotografoId: "ana", tipo: "ultrapassado", por: "daniel", virouLider: true, posicao: 2 },
    ]);
  });

  it("ultrapassagem no meio da tabela avisa só quem foi passado", () => {
    // Antes: Ana 10, Bia 3, Caio 2. Caio vendeu 2: Ana 10, Caio 4, Bia 3.
    const avisos = avisosDoRanking(r(["ana", 10], ["caio", 4], ["bia", 3]), new Map([["caio", 2]]));
    expect(avisos).toEqual([
      { fotografoId: "bia", tipo: "ultrapassado", por: "caio", virouLider: false, posicao: 3 },
    ]);
  });

  it("empate não é ultrapassagem; sair do empate no topo é novo líder", () => {
    // Antes: Ana 3, Bia 2. Bia vendeu 1: empate 3 a 3, ninguém é avisado.
    expect(avisosDoRanking(r(["ana", 3], ["bia", 3]), new Map([["bia", 1]]))).toEqual([]);
    // Antes empatados em 3. Bia vendeu 1: Bia 4 sozinha no topo.
    expect(avisosDoRanking(r(["bia", 4], ["ana", 3], ["caio", 1]), new Map([["bia", 1]]))).toEqual([
      { fotografoId: "bia", tipo: "voce_lider" },
      { fotografoId: "ana", tipo: "ultrapassado", por: "bia", virouLider: true, posicao: 2 },
      { fotografoId: "caio", tipo: "novo_lider", por: "bia" },
    ]);
  });

  it("líder que só aumenta a vantagem não gera aviso; evento de uma pessoa também não", () => {
    expect(avisosDoRanking(r(["ana", 8], ["bia", 2]), new Map([["ana", 3]]))).toEqual([]);
    expect(avisosDoRanking(r(["ana", 8]), new Map([["ana", 3]]))).toEqual([]);
  });

  it("o colega aparece pela posição, como na tela do ranking", () => {
    expect(rotuloDoColega(r(["daniel", 6], ["ana", 5]), "daniel")).toBe("Fotógrafo 1");
  });
});
