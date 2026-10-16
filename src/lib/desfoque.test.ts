import { describe, expect, it } from "vitest";

import {
  caixaDoCirculo,
  celulasDoMosaico,
  circuloDaRevelacao,
  FRACAO_DO_RAIO,
  fonteDaCaixa,
  lenteDaRevelacao,
  sementeDoId,
  ZOOM_DA_LENTE,
  tamanhoDaBase,
} from "./desfoque";

describe("circuloDaRevelacao", () => {
  // Foto na tela em (100, 50), 400x300; canvas com o dobro de densidade (800x600).
  const caixa = { x: 100, y: 50, largura: 400, altura: 300 };
  const canvas = { largura: 800, altura: 600 };

  it("converte o ponto da tela para px do canvas", () => {
    expect(circuloDaRevelacao({ x: 300, y: 200 }, caixa, canvas)).toEqual({
      x: 400,
      y: 300,
      r: FRACAO_DO_RAIO * 800,
    });
    expect(circuloDaRevelacao({ x: 100, y: 50 }, caixa, canvas)).toMatchObject({ x: 0, y: 0 });
    expect(circuloDaRevelacao({ x: 500, y: 350 }, caixa, canvas)).toMatchObject({ x: 800, y: 600 });
  });

  it("funciona com a foto escalada pela transição (a caixa na tela muda)", () => {
    const metade = { x: 0, y: 0, largura: 200, altura: 150 };
    expect(circuloDaRevelacao({ x: 100, y: 75 }, metade, canvas)).toMatchObject({ x: 400, y: 300 });
  });

  it("fora da foto não revela", () => {
    expect(circuloDaRevelacao({ x: 99, y: 200 }, caixa, canvas)).toBeNull();
    expect(circuloDaRevelacao({ x: 300, y: 351 }, caixa, canvas)).toBeNull();
  });

  it("medidas vazias não revelam", () => {
    expect(
      circuloDaRevelacao({ x: 0, y: 0 }, { x: 0, y: 0, largura: 0, altura: 0 }, canvas),
    ).toBeNull();
  });

  it("o diâmetro fica perto de 50% da largura", () => {
    const c = circuloDaRevelacao({ x: 300, y: 200 }, caixa, canvas)!;
    expect((2 * c.r) / canvas.largura).toBeCloseTo(0.5);
  });
});

describe("caixaDoCirculo", () => {
  const canvas = { largura: 800, altura: 600 };
  it("envolve o círculo em px inteiros", () => {
    expect(caixaDoCirculo({ x: 400, y: 300, r: 50.5 }, canvas)).toEqual({
      x: 349,
      y: 249,
      largura: 102,
      altura: 102,
    });
  });
  it("corta nas bordas do canvas", () => {
    expect(caixaDoCirculo({ x: 10, y: 590, r: 50 }, canvas)).toEqual({
      x: 0,
      y: 540,
      largura: 60,
      altura: 60,
    });
  });
});

describe("fonteDaCaixa", () => {
  it("mapeia a caixa do canvas para o mesmo pedaço da prévia", () => {
    const f = fonteDaCaixa(
      { x: 100, y: 50, largura: 200, altura: 100 },
      { largura: 400, altura: 300 },
      { largura: 800, altura: 600 },
    );
    expect(f).toEqual({ sx: 200, sy: 100, sw: 400, sh: 200, dx: 100, dy: 50, dw: 200, dh: 100 });
  });
});

describe("celulasDoMosaico", () => {
  it("é estável para a mesma foto e varia entre fotos", () => {
    const a = celulasDoMosaico(sementeDoId("foto-a"), 9, 12);
    expect(celulasDoMosaico(sementeDoId("foto-a"), 9, 12)).toEqual(a);
    expect(celulasDoMosaico(sementeDoId("foto-b"), 9, 12)).not.toEqual(a);
  });

  it("escolhe a fração pedida, sem repetir e dentro da grade", () => {
    const c = celulasDoMosaico(42, 10, 10, 0.2);
    expect(c).toHaveLength(20);
    expect(new Set(c.map((x) => `${x.coluna},${x.linha}`)).size).toBe(20);
    for (const { coluna, linha } of c) {
      expect(coluna).toBeGreaterThanOrEqual(0);
      expect(coluna).toBeLessThan(10);
      expect(linha).toBeGreaterThanOrEqual(0);
      expect(linha).toBeLessThan(10);
    }
    expect(celulasDoMosaico(1, 0, 10)).toEqual([]);
  });
});

describe("tamanhoDaBase", () => {
  it("reduz a prévia mantendo a proporção", () => {
    expect(tamanhoDaBase({ largura: 800, altura: 533 })).toEqual({ largura: 640, altura: 426 });
    expect(tamanhoDaBase({ largura: 300, altura: 200 })).toEqual({ largura: 300, altura: 200 });
  });
});

describe("lenteDaRevelacao", () => {
  // Foto de 400 x 300 na tela, a partir de (100, 50); canvas 800 x 600; prévia 1600 x 1200.
  const caixa = { x: 100, y: 50, largura: 400, altura: 300 };
  const canvas = { largura: 800, altura: 600 };
  const imagem = { largura: 1600, altura: 1200 };

  it("no mouse, centrada no cursor e ampliada", () => {
    const l = lenteDaRevelacao({ x: 300, y: 200 }, caixa, canvas, imagem, { toque: false })!;
    expect(l.circulo).toEqual({ x: 400, y: 300, r: 200 });
    // A fonte é menor que o círculo na mesma proporção do zoom, centrada no cursor.
    expect(l.fonte.sw).toBeCloseTo(((2 * 200) / ZOOM_DA_LENTE) * 2);
    expect(l.fonte.sx + l.fonte.sw / 2).toBeCloseTo(800);
    expect(l.fonte.sy + l.fonte.sh / 2).toBeCloseTo(600);
    expect(l.destino).toEqual({ x: 200, y: 100, largura: 400, altura: 400 });
  });

  it("no toque, sobe para o dedo não tapar, mas a fonte continua sob o dedo", () => {
    const l = lenteDaRevelacao({ x: 300, y: 250 }, caixa, canvas, imagem, { toque: true })!;
    // Sob o dedo: y 400 no canvas. A lupa sobe até a borda de baixo dela ficar acima do dedo,
    // sem sair do canvas.
    expect(l.circulo.y + l.circulo.r).toBeLessThanOrEqual(400);
    expect(l.circulo.y).toBeGreaterThanOrEqual(l.circulo.r);
    expect(l.fonte.sy + l.fonte.sh / 2).toBeCloseTo(800);
  });

  it("perto da borda, encosta nela em vez de cortar", () => {
    const l = lenteDaRevelacao({ x: 101, y: 51 }, caixa, canvas, imagem, { toque: true })!;
    expect(l.circulo.x).toBe(l.circulo.r);
    expect(l.circulo.y).toBe(l.circulo.r);
    expect(l.fonte.sx).toBe(0);
    expect(l.fonte.sy).toBe(0);
  });

  it("fora da foto, nada", () => {
    expect(lenteDaRevelacao({ x: 50, y: 50 }, caixa, canvas, imagem, { toque: true })).toBeNull();
  });
});
