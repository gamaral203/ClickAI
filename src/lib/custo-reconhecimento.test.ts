import { describe, expect, it } from "vitest";

import {
  CUSTO_REKOGNITION_POR_IMAGEM_USD,
  estimarCustoDoCadastro,
  formatarDolares,
} from "./custo-reconhecimento";

// O texto pode vir com espaço comum ou com o espaço fixo do Intl, conforme o Node.
const limpo = (texto: string) => texto.replace(/\s/g, " ");

describe("custo estimado do cadastro de rostos", () => {
  it("US$ 0,0013 por foto; cada vídeo conta até o teto de quadros", () => {
    expect(CUSTO_REKOGNITION_POR_IMAGEM_USD).toBe(0.0013);
    expect(estimarCustoDoCadastro({ itens: 500, videos: 0, quadrosPorVideo: 10 })).toEqual({
      imagens: 500,
      usd: 500 * 0.0013,
    });
    // 498 fotos + 2 vídeos de até 10 quadros.
    expect(estimarCustoDoCadastro({ itens: 500, videos: 2, quadrosPorVideo: 10 }).imagens).toBe(
      518,
    );
    expect(estimarCustoDoCadastro({ itens: 0, videos: 0, quadrosPorVideo: 10 }).usd).toBe(0);
  });

  it("mostra em dólares, com vírgula", () => {
    expect(limpo(formatarDolares(0.65)).replace("US$ ", "")).toBe("0,65");
    expect(limpo(formatarDolares(13))).toContain("13,00");
    expect(limpo(formatarDolares(0.0013))).toMatch(/^menos de US\$ 0,01$/);
    expect(limpo(formatarDolares(0))).toContain("0,00");
    // O preço unitário, com 4 casas.
    expect(limpo(formatarDolares(CUSTO_REKOGNITION_POR_IMAGEM_USD, 4))).toMatch(/^US\$ 0,0013$/);
  });
});
