import { describe, expect, it } from "vitest";

import { assinar, conferirAssinatura } from "./assinatura";

describe("assinatura", () => {
  it("devolve os dados de um token válido", () => {
    const token = assinar("pacote", { e: "ev1", i: ["a", "b"] }, 60_000);
    expect(conferirAssinatura("pacote", token)).toEqual({ e: "ev1", i: ["a", "b"] });
  });

  it("recusa token alterado, de outro propósito ou vencido", () => {
    const token = assinar("pacote", { e: "ev1", i: ["a"] }, 60_000);
    const [corpo, assinatura] = token.split(".");
    const outroCorpo = Buffer.from(
      JSON.stringify({ d: { e: "ev1", i: ["a", "b", "c"] }, x: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(conferirAssinatura("pacote", `${outroCorpo}.${assinatura}`)).toBeNull();
    expect(conferirAssinatura("outro", token)).toBeNull();
    expect(conferirAssinatura("pacote", `${corpo}.x`)).toBeNull();
    expect(conferirAssinatura("pacote", assinar("pacote", 1, -1))).toBeNull();
    expect(conferirAssinatura("pacote", "lixo")).toBeNull();
  });
});
