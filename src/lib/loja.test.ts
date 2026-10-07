import { describe, expect, it } from "vitest";

import { contraste, corDoTexto, idGaSeguro, idGtmSeguro, subdominioValido } from "./loja";

describe("IDs do Google", () => {
  it("aceita só o formato do ID", () => {
    expect(idGaSeguro("G-ABC123XYZ")).toBe("G-ABC123XYZ");
    expect(idGtmSeguro("GTM-AB12CD")).toBe("GTM-AB12CD");
  });

  it.each([
    "<script>alert(1)</script>",
    "G-ABC'); alert(1); ('",
    "UA-12345-1",
    "g-abc123",
    'G-ABC123"><img src=x>',
  ])("recusa %j", (valor) => {
    expect(idGaSeguro(valor)).toBeNull();
    expect(idGtmSeguro(valor)).toBeNull();
  });
});

describe("subdomínio", () => {
  it.each(["liaramos", "foto-sp", "abc", "estudio2026"])("aceita %s", (s) => {
    expect(subdominioValido(s)).toBe(true);
  });
  it.each(["ab", "-lia", "lia-", "Lia", "lia_ramos", "lia--ramos", "www", "admin", "a".repeat(33)])(
    "recusa %s",
    (s) => {
      expect(subdominioValido(s)).toBe(false);
    },
  );
});

describe("cores", () => {
  it("escolhe o texto com mais contraste", () => {
    expect(corDoTexto("#2362FE")).toBe("#ffffff");
    expect(corDoTexto("#BCFA34")).toBe("#111111");
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
});
