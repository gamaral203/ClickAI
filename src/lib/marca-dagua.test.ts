import { describe, expect, it } from "vitest";

import { chaveDaPreviaCelular, SUFIXO_DA_VERSAO, versaoDaChave } from "./marca-dagua";

describe("prévia do celular", () => {
  it("existe a partir da versão 4: a mesma chave com -celular", () => {
    expect(chaveDaPreviaCelular("previas/f/e/x-v4.webp")).toBe("previas/f/e/x-v4-celular.webp");
    expect(chaveDaPreviaCelular(`https://cdn.exemplo/previas/a${SUFIXO_DA_VERSAO}`)).toBe(
      `https://cdn.exemplo/previas/a${SUFIXO_DA_VERSAO.replace(".webp", "-celular.webp")}`,
    );
    // A chave do celular não é confundida com uma versão nova na regeração.
    expect(versaoDaChave("previas/f/e/x-v4-celular.webp")).toBe(1);
  });

  it("prévias antigas e dados de exemplo não têm", () => {
    expect(chaveDaPreviaCelular("previas/f/e/x-v3.webp")).toBeNull();
    expect(chaveDaPreviaCelular("previas/f/e/x.webp")).toBeNull();
    expect(chaveDaPreviaCelular("/exemplo/previas/3.webp")).toBeNull();
  });
});
