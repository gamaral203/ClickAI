import { describe, expect, it } from "vitest";

import { MODELOS_MARCA } from "./marca-dagua";
import {
  MINIMO_DA_GRADE,
  OPACIDADE_MAXIMA,
  OPACIDADE_MINIMA,
  OPACIDADE_MINIMA_CENTRO,
  planejarMarcas,
  planejarTrama,
  sementeDe,
  TRAMA,
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
      new Set(grade.map((m) => m[k].toFixed(3))).size;
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

describe("trama sobre a foto inteira", () => {
  const MINIMA: ConfigMarca = {
    tamanhoPct: LIMITES_MARCA.tamanhoPct.min,
    quantidade: LIMITES_MARCA.quantidade.min,
    opacidadePct: LIMITES_MARCA.opacidadePct.min,
    larguraPrevia: LIMITES_MARCA.larguraPrevia.min,
    qualidade: LIMITES_MARCA.qualidade.min,
    variacao: true,
  };
  const trama = (
    semente: string,
    config: ConfigMarca = CONFIG_MARCA_PADRAO,
    versao: "previa" | "miniatura" = "previa",
    [largura, altura] = [1600, 1067],
  ) => planejarTrama({ largura, altura, semente, config, versao });

  it("não deixa área limpa: toda faixa de 10% da foto tem microlográfica e linha", () => {
    for (const versao of ["previa", "miniatura"] as const) {
      for (const [largura, altura] of [
        [1600, 1067],
        [1067, 1600],
        [400, 267],
      ]) {
        const t = trama(ID_A, CONFIG_MARCA_PADRAO, versao, [largura, altura]);
        const blocos = 10;
        const [bw, bh] = [largura / blocos, altura / blocos];
        // Uma microlográfica cobre ~1 célula; o centro dela fica no bloco ou a meia célula dele.
        const folgaX = t.larguraMicro;
        const folgaY = t.larguraMicro / 2;
        for (let by = 0; by < blocos; by++) {
          for (let bx = 0; bx < blocos; bx++) {
            const [x0, y0] = [bx * bw, by * bh];
            const temMicro = t.micros.some(
              (m) =>
                m.x >= x0 - folgaX &&
                m.x <= x0 + bw + folgaX &&
                m.y >= y0 - folgaY &&
                m.y <= y0 + bh + folgaY,
            );
            expect(temMicro, `${versao} ${largura}x${altura} bloco ${bx},${by}`).toBe(true);
          }
        }
        // Linhas: em cada bloco passa pelo menos uma (algum segmento dentro do bloco ampliado).
        const passo = Math.max(
          TRAMA.passoMinimoPx,
          Math.max(largura, altura) * TRAMA.passoLinhas[versao],
        );
        for (let by = 0; by < blocos; by++) {
          for (let bx = 0; bx < blocos; bx++) {
            const [cx, cy] = [(bx + 0.5) * bw, (by + 0.5) * bh];
            const perto = t.linhas.some((l) =>
              l.pontos.some(
                ([x, y]) => Math.hypot(x - cx, y - cy) < Math.max(bw, bh) / 2 + passo * 2,
              ),
            );
            expect(perto, `linha ${versao} bloco ${bx},${by}`).toBe(true);
          }
        }
      }
    }
  });

  it("muda de foto para foto, a mesma foto sai igual, e sem variação fica fixa", () => {
    const a = JSON.stringify(trama(ID_A));
    expect(JSON.stringify(trama(ID_A))).toBe(a);
    expect(JSON.stringify(trama(ID_B))).not.toBe(a);
    const fixo = { ...CONFIG_MARCA_PADRAO, variacao: false };
    expect(JSON.stringify(trama(ID_A, fixo))).toBe(JSON.stringify(trama(ID_B, fixo)));
  });

  it("sem padrão periódico fixo: vãos e ondas variam de linha para linha", () => {
    const t = trama(ID_A);
    // Os pontos do meio das linhas não caem numa grade fixa (vão sorteado por linha).
    const meios = t.linhas.map((l) => l.pontos[Math.floor(l.pontos.length / 2)]);
    const xs = new Set(meios.map(([x]) => Math.round(x)));
    expect(xs.size).toBeGreaterThan(meios.length * 0.8);
    // As linhas são onduladas (não retas): algum ponto sai da reta entre as pontas.
    const onduladas = t.linhas.filter((l) => {
      const [[x1, y1], [x2, y2]] = [l.pontos[0], l.pontos[l.pontos.length - 1]];
      const distancia = (mx: number, my: number) =>
        Math.abs((y2 - y1) * mx - (x2 - x1) * my + x2 * y1 - y2 * x1) /
        Math.hypot(x2 - x1, y2 - y1);
      return l.pontos.some(([x, y]) => distancia(x, y) > 1);
    });
    expect(onduladas.length).toBeGreaterThan(t.linhas.length * 0.8);
    // Os giros das microlográficas variam dentro da foto.
    expect(new Set(t.micros.map((m) => m.angulo.toFixed(1))).size).toBeGreaterThan(
      t.micros.length / 2,
    );
  });

  it("opacidade acompanha o gestor, mas nunca abaixo do piso nem acima do teto", () => {
    const minima = trama(ID_A, MINIMA);
    expect(minima.opacidadeMicro).toBeGreaterThanOrEqual(TRAMA.opacidadeMicro * TRAMA.fator.min);
    expect(minima.opacidadeLinhas).toBeGreaterThanOrEqual(TRAMA.opacidadeLinhas * TRAMA.fator.min);
    const maxima = trama(ID_A, {
      ...CONFIG_MARCA_PADRAO,
      opacidadePct: LIMITES_MARCA.opacidadePct.max,
    });
    expect(maxima.opacidadeMicro).toBeLessThanOrEqual(TRAMA.opacidadeMicro * TRAMA.fator.max);
    expect(maxima.opacidadeMicro).toBeGreaterThan(minima.opacidadeMicro);
    // Fraca o bastante para a pessoa se reconhecer na prévia.
    expect(maxima.opacidadeMicro).toBeLessThan(0.4);
    expect(maxima.opacidadeLinhas).toBeLessThan(0.3);
    // A microlográfica é pequena (textura, não logo): no máximo ~10% do lado maior.
    expect(trama(ID_A).larguraMicro).toBeLessThanOrEqual(1600 * 0.1);
  });
});
