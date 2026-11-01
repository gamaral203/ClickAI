import { describe, expect, it } from "vitest";

import { calcularSaque } from "@/servicos/financeiro";

import { exemploDeVenda, SLIDES_TOPO } from "./vender-fotos";

describe("exemploDeVenda", () => {
  it("Pix: só a comissão, sem acréscimo para o cliente", () => {
    expect(exemploDeVenda(10000, "pix", 8, 4.98)).toEqual({
      clientePagaCentavos: 10000,
      taxaCartaoCentavos: 0,
      comissaoCentavos: 800,
      antecipacaoCentavos: 0,
      recebeCentavos: 9200,
    });
  });

  it("cartão: metade da taxa sai da parte do fotógrafo, antes da comissão", () => {
    expect(exemploDeVenda(10000, "cartao", 8, 4.98)).toEqual({
      clientePagaCentavos: 10263,
      taxaCartaoCentavos: 250,
      comissaoCentavos: 780,
      antecipacaoCentavos: 0,
      recebeCentavos: 8970,
    });
  });

  it("cartão antecipado: fecha com o cálculo do saque de verdade", () => {
    const exemplo = exemploDeVenda(10000, "cartao_antecipado", 8, 4.98);
    const agora = Date.UTC(2026, 10, 1);
    const ontem = new Date(agora - 2 * 86_400_000).toISOString();
    const daquiAUmMes = new Date(agora + 28 * 86_400_000).toISOString();
    const saque = calcularSaque(
      [
        {
          id: "l1",
          valorCentavos: 10000 - exemplo.taxaCartaoCentavos,
          disponivelEm: daquiAUmMes,
          antecipavelEm: ontem,
          saqueId: null,
          metodo: "cartao",
        },
      ],
      agora,
      8,
      true,
    );
    expect(exemplo.recebeCentavos).toBe(8776);
    expect(exemplo.recebeCentavos).toBe(saque.liquidoCentavos);
    expect(exemplo.antecipacaoCentavos).toBe(saque.taxaAntecipacaoCentavos);
  });
});

describe("SLIDES_TOPO", () => {
  it("só usa imagens da vitrine autorizada, nunca arquivos de fora do site", () => {
    expect(SLIDES_TOPO.length).toBeGreaterThan(0);
    for (const slide of SLIDES_TOPO) {
      const arquivos = slide.tipo === "imagem" ? [slide.imagem.src] : [slide.src, slide.poster];
      for (const arquivo of arquivos) expect(arquivo).toMatch(/^\/(vitrine|inicio)\//);
      expect(slide.rotulo).not.toBe("");
    }
  });
});
