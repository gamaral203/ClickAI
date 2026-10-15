import { describe, expect, it } from "vitest";

import { MODELOS_MARCA } from "./marca-dagua";
import {
  MINIMO_DA_GRADE,
  OPACIDADE_MAXIMA,
  OPACIDADE_MINIMA,
  OPACIDADE_MINIMA_CENTRO,
  planejarMarcas,
  sementeDe,
} from "./marca-distribuida";
import { CONFIG_MARCA_PADRAO, LIMITES_MARCA, type ConfigMarca } from "./protecao-previas";

const ID_A = "0b6c2f9e-1d1a-4c1e-9a55-3f0d6a1f0001";
const ID_B = "0b6c2f9e-1d1a-4c1e-9a55-3f0d6a1f0002";

function plano(semente: string, config: ConfigMarca = CONFIG_MARCA_PADRAO, largura = 1600) {
  return planejarMarcas({
    largura,
    altura: Math.round((largura * 2) / 3),
    semente,
    config,
    modelo: "padrao",
    versao: "previa",
  });
}

const resumo = (p: ReturnType<typeof plano>) =>
  p.marcas.map((m) => [m.x, m.y, m.largura, m.angulo, m.opacidade].map((n) => n.toFixed(2)));

describe("plano da marca d'água distribuída", () => {
  it("a mesma foto sai sempre igual, e fotos diferentes têm padrões diferentes", () => {
    expect(resumo(plano(ID_A))).toEqual(resumo(plano(ID_A)));
    expect(resumo(plano(ID_A))).not.toEqual(resumo(plano(ID_B)));
    // Mudança de verdade: a maioria das logos da grade fica em outro lugar.
    const a = plano(ID_A).marcas.filter((m) => m.papel === "grade");
    const b = plano(ID_B).marcas.filter((m) => m.papel === "grade");
    const iguais = a.filter((m) => b.some((n) => Math.hypot(m.x - n.x, m.y - n.y) < 20));
    expect(iguais.length).toBeLessThan(a.length / 2);
  });

  it("sem variação, todas as fotos do mesmo tamanho têm o mesmo desenho", () => {
    const fixo = { ...CONFIG_MARCA_PADRAO, variacao: false };
    expect(resumo(plano(ID_A, fixo))).toEqual(resumo(plano(ID_B, fixo)));
  });

  it("número de marcas acompanha a configuração, com logo no centro e no terço de cima", () => {
    for (const quantidade of [10, 16, 32, 48]) {
      const p = plano(ID_A, { ...CONFIG_MARCA_PADRAO, quantidade });
      const grade = p.marcas.filter((m) => m.papel === "grade").length;
      // Pela área: perto do pedido (as da borda contam), nunca abaixo do mínimo.
      expect(grade).toBeGreaterThanOrEqual(Math.max(MINIMO_DA_GRADE.previa, quantidade * 0.6));
      expect(grade).toBeLessThanOrEqual(quantidade * 1.8 + 6);
      expect(p.marcas.filter((m) => m.papel === "centro")).toHaveLength(1);
      expect(p.marcas.filter((m) => m.papel === "assunto")).toHaveLength(1);
    }
    const poucas = plano(ID_A, { ...CONFIG_MARCA_PADRAO, quantidade: 10 }).marcas.length;
    const muitas = plano(ID_A, { ...CONFIG_MARCA_PADRAO, quantidade: 40 }).marcas.length;
    expect(muitas).toBeGreaterThan(poucas * 2);
  });

  it("marcas sobre o centro e o terço de cima, e espalhadas pelos quatro quadrantes", () => {
    for (const semente of [ID_A, ID_B, "outra", "mais-uma"]) {
      const p = plano(semente);
      const [w, h] = [1600, 1067];
      const centro = p.marcas.find((m) => m.papel === "centro")!;
      expect(Math.abs(centro.x - w / 2)).toBeLessThan(w * 0.06);
      expect(Math.abs(centro.y - h / 2)).toBeLessThan(h * 0.06);
      expect(centro.largura).toBeGreaterThan(w * 0.25);
      const assunto = p.marcas.find((m) => m.papel === "assunto")!;
      expect(assunto.y).toBeLessThan(h * 0.45);
      // Cruzada com a do centro: um corte reto não tira as duas.
      expect(Math.abs(assunto.angulo - centro.angulo)).toBeGreaterThan(20);
      const quadrantes = new Set(
        p.marcas
          .filter((m) => m.papel === "grade" && m.x > 0 && m.x < w && m.y > 0 && m.y < h)
          .map((m) => `${m.x < w / 2}:${m.y < h / 2}`),
      );
      expect(quadrantes.size).toBe(4);
    }
  });

  it("tamanhos, giros e opacidades variam dentro da mesma foto", () => {
    const grade = plano(ID_A).marcas.filter((m) => m.papel === "grade");
    const distintos = (k: "largura" | "angulo" | "opacidade") =>
      new Set(grade.map((m) => m[k].toFixed(2))).size;
    expect(distintos("largura")).toBeGreaterThan(grade.length / 2);
    expect(distintos("angulo")).toBeGreaterThan(grade.length / 2);
    expect(distintos("opacidade")).toBeGreaterThan(grade.length / 2);
  });

  it("opacidade nunca abaixo do piso, em qualquer modelo e com a configuração mínima", () => {
    const minima: ConfigMarca = {
      tamanhoPct: LIMITES_MARCA.tamanhoPct.min,
      quantidade: LIMITES_MARCA.quantidade.min,
      opacidadePct: LIMITES_MARCA.opacidadePct.min,
      larguraPrevia: LIMITES_MARCA.larguraPrevia.min,
      qualidade: LIMITES_MARCA.qualidade.min,
      variacao: true,
    };
    for (const modelo of MODELOS_MARCA) {
      for (const versao of ["previa", "miniatura"] as const) {
        const p = planejarMarcas({
          largura: 800,
          altura: 533,
          semente: ID_A,
          config: minima,
          modelo,
          versao,
        });
        for (const m of p.marcas) {
          expect(m.opacidade).toBeGreaterThanOrEqual(OPACIDADE_MINIMA);
          expect(m.opacidade).toBeLessThanOrEqual(OPACIDADE_MAXIMA);
        }
        const centro = p.marcas.find((m) => m.papel === "centro")!;
        expect(centro.opacidade).toBeGreaterThanOrEqual(OPACIDADE_MINIMA_CENTRO);
        expect(p.marcas.filter((m) => m.papel === "grade").length).toBeGreaterThanOrEqual(
          MINIMO_DA_GRADE[versao],
        );
      }
    }
  });

  it("semente estável por id", () => {
    expect(sementeDe(ID_A)).toBe(sementeDe(ID_A));
    expect(sementeDe(ID_A)).not.toBe(sementeDe(ID_B));
  });
});
