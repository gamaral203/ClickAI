import { describe, expect, it } from "vitest";

import {
  acaoDoGesto,
  encaixar,
  imagemDoVisualizador,
  indiceDaPosicao,
  partidaDaMiniatura,
  passoDaNavegacao,
  podeIr,
  vizinhas,
} from "./visualizador";

describe("passoDaNavegacao", () => {
  const meio = { pagina: 2, totalPaginas: 3 };

  it("anda dentro da página carregada", () => {
    expect(passoDaNavegacao(0, 48, 1, meio)).toEqual({ tipo: "indice", indice: 1 });
    expect(passoDaNavegacao(10, 48, -1, meio)).toEqual({ tipo: "indice", indice: 9 });
  });

  it("no fim da página pede a próxima e abre a primeira foto dela", () => {
    expect(passoDaNavegacao(47, 48, 1, meio)).toEqual({
      tipo: "pagina",
      pagina: 3,
      posicao: "inicio",
    });
  });

  it("no começo da página pede a anterior e abre a última foto dela", () => {
    expect(passoDaNavegacao(0, 48, -1, meio)).toEqual({
      tipo: "pagina",
      pagina: 1,
      posicao: "fim",
    });
  });

  it("para no começo e no fim da galeria", () => {
    expect(passoDaNavegacao(0, 48, -1, { pagina: 1, totalPaginas: 3 })).toBeNull();
    expect(passoDaNavegacao(11, 12, 1, { pagina: 3, totalPaginas: 3 })).toBeNull();
    expect(podeIr(11, 12, 1, { pagina: 3, totalPaginas: 3 })).toBe(false);
    expect(podeIr(0, 12, 1, { pagina: 3, totalPaginas: 3 })).toBe(true);
  });

  it("sem paginação (resultado da busca) fica na lista", () => {
    expect(passoDaNavegacao(4, 5, 1, null)).toBeNull();
    expect(passoDaNavegacao(0, 5, -1, null)).toBeNull();
    expect(passoDaNavegacao(2, 5, 1, null)).toEqual({ tipo: "indice", indice: 3 });
  });

  it("lista vazia não navega", () => {
    expect(passoDaNavegacao(0, 0, 1, meio)).toBeNull();
  });

  it("índice na página carregada", () => {
    expect(indiceDaPosicao("inicio", 48)).toBe(0);
    expect(indiceDaPosicao("fim", 48)).toBe(47);
    expect(indiceDaPosicao("fim", 0)).toBe(0);
  });

  it("vizinhas para pré-carregar", () => {
    expect(vizinhas(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(vizinhas(["a", "b", "c"], 0)).toEqual(["b"]);
    expect(vizinhas(["a"], 0)).toEqual([]);
  });
});

describe("acaoDoGesto", () => {
  const parado = { x: 0, y: 0 };
  it("para a esquerda é a próxima, para a direita a anterior", () => {
    expect(acaoDoGesto({ x: -120, y: 10 }, parado)).toBe("proxima");
    expect(acaoDoGesto({ x: 120, y: -10 }, parado)).toBe("anterior");
  });
  it("deslize rápido curto também conta", () => {
    expect(acaoDoGesto({ x: -30, y: 0 }, { x: -900, y: 0 })).toBe("proxima");
  });
  it("para baixo fecha; para cima não", () => {
    expect(acaoDoGesto({ x: 5, y: 160 }, parado)).toBe("fechar");
    expect(acaoDoGesto({ x: 5, y: -160 }, parado)).toBeNull();
  });
  it("arrasto curto e lento volta ao lugar", () => {
    expect(acaoDoGesto({ x: -30, y: 5 }, { x: -100, y: 0 })).toBeNull();
    expect(acaoDoGesto({ x: 0, y: 40 }, { x: 0, y: 100 })).toBeNull();
  });
});

describe("partidaDaMiniatura", () => {
  it("põe a foto final exatamente sobre a miniatura quadrada, sem deformar", () => {
    // Foto 3:2 de 600x400 no centro; miniatura de 100x100 no canto.
    const p = partidaDaMiniatura(
      { x: 0, y: 0, largura: 100, altura: 100 },
      { x: 200, y: 100, largura: 600, altura: 400 },
    );
    expect(p).not.toBeNull();
    // Escala de cover: a altura (400) vira 100.
    expect(p!.escala).toBeCloseTo(0.25);
    // Centro da miniatura (50,50) menos o centro final (500,300).
    expect(p!.x).toBe(-450);
    expect(p!.y).toBe(-250);
    // Mostra só o meio quadrado: corta 100 px de cada lado (em px da foto final).
    expect(p!.recorte).toMatch(/^inset\(0\.0px 100\.0px 0\.0px 100\.0px/);
  });

  it("caixa final vazia não anima", () => {
    expect(
      partidaDaMiniatura(
        { x: 0, y: 0, largura: 10, altura: 10 },
        { x: 0, y: 0, largura: 0, altura: 0 },
      ),
    ).toBeNull();
  });
});

describe("encaixar", () => {
  it("encaixa a foto na área sem cortar", () => {
    expect(encaixar({ largura: 3000, altura: 2000 }, { largura: 300, altura: 600 })).toEqual({
      largura: 300,
      altura: 200,
    });
    expect(encaixar({ largura: 2000, altura: 3000 }, { largura: 600, altura: 300 })).toEqual({
      largura: 200,
      altura: 300,
    });
  });
});

describe("imagemDoVisualizador (só prévia, nunca o original)", () => {
  // Campos de mentira com "original" para provar que a função não lê nada além da prévia.
  const foto = {
    id: "f1",
    urlPrevia: "https://previas.exemplo/previas/f1.jpg",
    urlPreviaCelular: "https://previas.exemplo/previas/f1-celular.jpg",
    urlMiniatura: "https://previas.exemplo/miniaturas/f1.jpg",
    largura: 3000,
    altura: 2000,
    urlOriginal: "https://privado.exemplo/originais/f1.jpg",
    chaveOriginal: "originais/f1.jpg",
  };

  it("usa a prévia do celular em tela estreita e a prévia normal no resto", () => {
    expect(imagemDoVisualizador(foto, true)).toBe(foto.urlPreviaCelular);
    expect(imagemDoVisualizador(foto, false)).toBe(foto.urlPrevia);
    expect(imagemDoVisualizador({ ...foto, urlPreviaCelular: null }, true)).toBe(foto.urlPrevia);
  });

  it("nunca devolve o endereço do original", () => {
    for (const estreita of [true, false]) {
      const url = imagemDoVisualizador(foto, estreita);
      expect(url).not.toContain("original");
      expect([foto.urlPrevia, foto.urlPreviaCelular]).toContain(url);
    }
  });
});
