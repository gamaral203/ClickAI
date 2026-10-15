import { describe, expect, it } from "vitest";

import type { Foto } from "@/dados/tipos";

import {
  esquecerResultado,
  guardarResultado,
  lerResultado,
  VALIDADE_DA_BUSCA_MS,
} from "./resultado-da-busca";

function guardaFalsa() {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  };
}

const T = 1_700_000_000_000;

function foto(id: string): Foto {
  return {
    id,
    eventoId: "evento-1",
    pastaId: null,
    enviadaPor: "fotografo-1",
    tipo: "foto",
    urlPrevia: `https://img.exemplo/previas/${id}.webp`,
    urlMiniatura: `https://img.exemplo/miniaturas/${id}.webp`,
    nomeArquivo: `${id}.jpg`,
    largura: 3000,
    altura: 2000,
    duracaoS: null,
    capturadaEm: null,
    precoCentavos: null,
    ordem: 1,
    status: "pronta",
    criadoEm: new Date(T).toISOString(),
    excluidaEm: null,
    liberacao: "automatica",
    liberarEm: new Date(T).toISOString(),
  };
}

describe("resultado da busca por selfie lembrado na aba", () => {
  it("volta o resultado do mesmo evento até vencer, e nunca o de outro evento", () => {
    const g = guardaFalsa();
    guardarResultado("corrida", { fotos: [foto("a"), foto("b")], pacote: null }, T, g);
    expect(lerResultado("corrida", T + 60_000, g)?.fotos.map((f) => f.id)).toEqual(["a", "b"]);
    expect(lerResultado("corrida", T + 60_000, g)?.em).toBe(T);
    expect(lerResultado("festa", T + 60_000, g)).toBeNull();
    // Venceu: some da aba.
    expect(lerResultado("corrida", T + VALIDADE_DA_BUSCA_MS + 1, g)).toBeNull();
    expect(g.dados.size).toBe(0);
  });

  it("guarda só fotos, pacote e horário: nada da selfie nem a posição do rosto", () => {
    const g = guardaFalsa();
    const vindoDaRota = {
      fotos: [foto("a")],
      pacote: null,
      recortes: { a: { esquerda: 0.1, topo: 0.2, largura: 0.1, altura: 0.1 } },
      selfie: "bytes-que-nunca-podem-ser-guardados",
    };
    guardarResultado("corrida", vindoDaRota, T, g);
    const [[chave, texto]] = [...g.dados.entries()];
    expect(chave).toBe("clicouai:busca-selfie:corrida");
    expect(Object.keys(JSON.parse(texto)).sort()).toEqual(["em", "fotos", "pacote"]);
    expect(texto).not.toContain("recortes");
    expect(texto).not.toContain("bytes-que-nunca");
    expect(texto).not.toContain("originais/");
  });

  it("buscar de novo esquece o resultado", () => {
    const g = guardaFalsa();
    guardarResultado("corrida", { fotos: [foto("a")], pacote: null }, T, g);
    esquecerResultado("corrida", g);
    expect(lerResultado("corrida", T, g)).toBeNull();
  });

  it("dado estragado ou alterado vira 'sem resultado'", () => {
    const g = guardaFalsa();
    g.setItem("clicouai:busca-selfie:corrida", "{não é json");
    expect(lerResultado("corrida", T, g)).toBeNull();
    g.setItem("clicouai:busca-selfie:corrida", JSON.stringify({ em: T, fotos: [{ id: 1 }] }));
    expect(lerResultado("corrida", T, g)).toBeNull();
    // Horário no futuro (relógio mexido) não estica a validade.
    g.setItem(
      "clicouai:busca-selfie:corrida",
      JSON.stringify({ em: T + 3_600_000, fotos: [], pacote: null }),
    );
    expect(lerResultado("corrida", T, g)).toBeNull();
  });

  it("sem sessionStorage (ou com ele cheio), nada quebra", () => {
    const cheio = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() =>
      guardarResultado("corrida", { fotos: [foto("a")], pacote: null }, T, cheio),
    ).not.toThrow();
    expect(lerResultado("corrida", T, cheio)).toBeNull();
    expect(() => esquecerResultado("corrida", cheio)).not.toThrow();
    // No servidor (sem window), sem armazenamento.
    expect(lerResultado("corrida", T, null)).toBeNull();
    expect(() => guardarResultado("corrida", { fotos: [], pacote: null })).not.toThrow();
  });

  it("resultado grande demais para a aba não é guardado", () => {
    const g = guardaFalsa();
    const muitas = Array.from({ length: 5000 }, (_, i) => foto(`foto-${i}`.padEnd(200, "x")));
    guardarResultado("corrida", { fotos: muitas, pacote: null }, T, g);
    expect(g.dados.size).toBe(0);
  });
});
