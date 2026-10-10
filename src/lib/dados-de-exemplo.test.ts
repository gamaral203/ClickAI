import { describe, expect, it } from "vitest";

import { mostrarDadosDeExemplo, rodaNoBancoDeExemplo } from "./dados-de-exemplo";

describe("mostrarDadosDeExemplo", () => {
  it("no banco de exemplo (sem URL), fora da produção, mostra", () => {
    expect(mostrarDadosDeExemplo({})).toBe(true);
    expect(mostrarDadosDeExemplo({ VERCEL_ENV: "preview" })).toBe(true);
    expect(mostrarDadosDeExemplo({ VERCEL_ENV: "development" })).toBe(true);
  });

  it("na produção, nunca mostra, nem sem URL de banco", () => {
    expect(mostrarDadosDeExemplo({ VERCEL_ENV: "production" })).toBe(false);
    expect(
      mostrarDadosDeExemplo({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://x" }),
    ).toBe(false);
  });

  it("com um banco de verdade, não mostra, mesmo fora da produção", () => {
    expect(mostrarDadosDeExemplo({ DATABASE_URL: "postgresql://x" })).toBe(false);
    expect(mostrarDadosDeExemplo({ VERCEL_ENV: "preview", POSTGRES_URL: "postgresql://x" })).toBe(
      false,
    );
  });

  it("rodaNoBancoDeExemplo depende só da URL do banco", () => {
    expect(rodaNoBancoDeExemplo({})).toBe(true);
    expect(rodaNoBancoDeExemplo({ DATABASE_URL: "" })).toBe(true);
    expect(rodaNoBancoDeExemplo({ POSTGRES_URL: "postgresql://x" })).toBe(false);
  });
});
