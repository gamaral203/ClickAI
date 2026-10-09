import { afterEach, describe, expect, it, vi } from "vitest";

import { mercadoPagoFaltandoEmProducao } from "./ambiente-producao";
import { mercadoPagoConfigurado } from "./mercadopago";

describe("produção exige MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fora da produção, nada é exigido (preview e desenvolvimento usam o simulado)", () => {
    expect(mercadoPagoFaltandoEmProducao({ VERCEL_ENV: "preview" })).toEqual([]);
    expect(mercadoPagoFaltandoEmProducao({})).toEqual([]);
  });

  it("na produção, aponta o nome do que falta", () => {
    expect(mercadoPagoFaltandoEmProducao({ VERCEL_ENV: "production" })).toEqual([
      "MP_ACCESS_TOKEN",
      "MP_WEBHOOK_SECRET",
    ]);
    expect(
      mercadoPagoFaltandoEmProducao({ VERCEL_ENV: "production", MP_ACCESS_TOKEN: "x" }),
    ).toEqual(["MP_WEBHOOK_SECRET"]);
    expect(
      mercadoPagoFaltandoEmProducao({
        VERCEL_ENV: "production",
        MP_ACCESS_TOKEN: "x",
        MP_WEBHOOK_SECRET: "y",
      }),
    ).toEqual([]);
  });

  it("o servidor de produção recusa cair no pagamento simulado", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    vi.stubEnv("MP_WEBHOOK_SECRET", "");
    expect(() => mercadoPagoConfigurado()).toThrow(/MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET/);
    vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
    vi.stubEnv("MP_WEBHOOK_SECRET", "segredo");
    expect(mercadoPagoConfigurado()).toBe(true);
  });
});
