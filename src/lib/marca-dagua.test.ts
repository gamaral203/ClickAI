import { describe, expect, it } from "vitest";

import {
  chaveDaPreviaCelular,
  revisaoDaChave,
  sufixoDaVersao,
  VERSAO_DA_MARCA,
  versaoDaChave,
} from "./marca-dagua";

describe("prévia do celular", () => {
  it("existe a partir da versão 4: a mesma chave com -celular", () => {
    expect(chaveDaPreviaCelular("previas/f/e/x-v4.webp")).toBe("previas/f/e/x-v4-celular.webp");
    expect(chaveDaPreviaCelular(`https://cdn.exemplo/previas/a${sufixoDaVersao(2)}`)).toBe(
      `https://cdn.exemplo/previas/a${sufixoDaVersao(2).replace(".webp", "-celular.webp")}`,
    );
    // A chave do celular não é confundida com uma versão nova na regeração.
    expect(versaoDaChave("previas/f/e/x-v4-celular.webp")).toBe(1);
    expect(versaoDaChave("previas/f/e/x-v5-r2-celular.webp")).toBe(1);
  });

  it("prévias antigas e dados de exemplo não têm", () => {
    expect(chaveDaPreviaCelular("previas/f/e/x-v3.webp")).toBeNull();
    expect(chaveDaPreviaCelular("previas/f/e/x.webp")).toBeNull();
    expect(chaveDaPreviaCelular("/exemplo/previas/3.webp")).toBeNull();
  });
});

describe("versão e revisão na chave", () => {
  it("a chave da versão atual leva a revisão da configuração", () => {
    expect(sufixoDaVersao(0)).toBe(`-v${VERSAO_DA_MARCA}-r0.webp`);
    expect(sufixoDaVersao(7)).toBe(`-v${VERSAO_DA_MARCA}-r7.webp`);
    expect(versaoDaChave(`previas/f/e/x${sufixoDaVersao(7)}`)).toBe(VERSAO_DA_MARCA);
    expect(revisaoDaChave(`previas/f/e/x${sufixoDaVersao(7)}`)).toBe(7);
  });

  it("chaves de antes não têm revisão", () => {
    expect(versaoDaChave("previas/f/e/x-v4.webp")).toBe(4);
    expect(revisaoDaChave("previas/f/e/x-v4.webp")).toBeNull();
    expect(revisaoDaChave("previas/f/e/x.webp")).toBeNull();
  });
});
