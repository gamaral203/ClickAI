import { afterEach, describe, expect, it, vi } from "vitest";

import {
  categoriaComNumero,
  confiancaMinima,
  extrairNumeros,
  normalizarNumero,
  type TextoDetectado,
} from "@/lib/numeros-de-peito";

/** Item do DetectText com uma caixa de 6% da altura da imagem (bem legível). */
function texto(
  DetectedText: string,
  Confidence = 99,
  Type = "WORD",
  Height = 0.06,
): TextoDetectado {
  return {
    DetectedText,
    Type,
    Confidence,
    Geometry: { BoundingBox: { Left: 0.3, Top: 0.4, Width: 0.1, Height } },
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("normalizarNumero", () => {
  it("tira espaços e zeros à esquerda, igual na gravação e na busca", () => {
    expect(normalizarNumero(" 1027 ")).toBe("1027");
    expect(normalizarNumero("0123")).toBe("123");
    expect(normalizarNumero("000")).toBe("0");
    expect(normalizarNumero("7")).toBe("7");
  });

  it("recusa o que não é número de peito", () => {
    for (const v of ["", "A123", "12:30", "15/03", "1234567", "12 34", "-5", "1e3", null, 42]) {
      expect(normalizarNumero(v)).toBeNull();
    }
  });
});

describe("extrairNumeros (resposta do DetectText)", () => {
  it("pega os números válidos, com confiança e caixa, a maior confiança primeiro", () => {
    const numeros = extrairNumeros([
      texto("1027", 97.5, "LINE"),
      texto("1027", 97.5),
      texto("348", 99.1),
      texto("MARATONA", 99.8, "LINE"),
    ]);
    expect(numeros).toEqual([
      {
        numero: "348",
        confianca: 99.1,
        caixa: { esquerda: 0.3, topo: 0.4, largura: 0.1, altura: 0.06 },
      },
      {
        numero: "1027",
        confianca: 97.5,
        caixa: { esquerda: 0.3, topo: 0.4, largura: 0.1, altura: 0.06 },
      },
    ]);
  });

  it("descarta baixa confiança, e um dígito só pede confiança alta", () => {
    expect(extrairNumeros([texto("512", 84.9)])).toEqual([]);
    expect(extrairNumeros([texto("512", 85)]).map((n) => n.numero)).toEqual(["512"]);
    expect(extrairNumeros([texto("7", 90)])).toEqual([]);
    expect(extrairNumeros([texto("7", 96)]).map((n) => n.numero)).toEqual(["7"]);
    expect(extrairNumeros([texto("512", 80)], { confianca: 75 })).toHaveLength(1);
  });

  it("descarta número pequeno demais na imagem (de fundo)", () => {
    expect(extrairNumeros([texto("2048", 99, "WORD", 0.01)])).toEqual([]);
    expect(extrairNumeros([texto("2048", 99, "WORD", 0.015)])).toHaveLength(1);
    expect(extrairNumeros([{ DetectedText: "2048", Type: "WORD", Confidence: 99 }])).toEqual([]);
  });

  it("descarta datas, horários e linhas com espaço; ano solto vale", () => {
    const numeros = extrairNumeros([
      texto("12:30"),
      texto("15/03/2024"),
      texto("15.03"),
      texto("15 03 2024", 99, "LINE"),
      texto("10 KM", 99, "LINE"),
      texto("KM5"),
      texto("A123"),
      texto("2024"),
    ]);
    expect(numeros.map((n) => n.numero)).toEqual(["2024"]);
  });

  it("tira # e pontuação grudados, zeros à esquerda e juntas os repetidos", () => {
    const numeros = extrairNumeros([
      texto("#0451", 90),
      texto("451.", 95),
      texto("451", 92, "LINE"),
      texto("1234567"),
    ]);
    expect(numeros).toHaveLength(1);
    expect(numeros[0]).toMatchObject({ numero: "451", confianca: 95 });
  });

  it("ignora tipos desconhecidos e limita a quantidade por foto", () => {
    expect(extrairNumeros([texto("300", 99, "OUTRO")])).toEqual([]);
    const muitos = Array.from({ length: 40 }, (_, i) => texto(String(100 + i)));
    expect(extrairNumeros(muitos)).toHaveLength(30);
    expect(extrairNumeros(muitos, { maximo: 5 })).toHaveLength(5);
  });
});

describe("configuração", () => {
  it("REKOGNITION_TEXTO_CONFIANCA vale entre 50 e 99; fora disso, 85", () => {
    expect(confiancaMinima(undefined)).toBe(85);
    expect(confiancaMinima("90")).toBe(90);
    expect(confiancaMinima("30")).toBe(85);
    expect(confiancaMinima("abc")).toBe(85);
    vi.stubEnv("REKOGNITION_TEXTO_CONFIANCA", "70");
    expect(confiancaMinima()).toBe(70);
  });

  it("a leitura nasce ligada só nas categorias com peito", () => {
    for (const slug of ["corrida", "ciclismo", "esportes", "esportes-aquaticos"]) {
      expect(categoriaComNumero(slug)).toBe(true);
    }
    for (const slug of ["casamentos", "cavalgadas-e-vaquejadas", "formatura", "", null]) {
      expect(categoriaComNumero(slug)).toBe(false);
    }
  });
});
