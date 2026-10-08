import { describe, expect, it } from "vitest";

import { gerarNonce, politicaDeSeguranca } from "./csp";

function diretiva(csp: string, nome: string) {
  return csp
    .split("; ")
    .find((d) => d.startsWith(`${nome} `))
    ?.split(" ")
    .slice(1);
}

describe("CSP", () => {
  it("gera um nonce novo e imprevisível a cada chamada", () => {
    const a = gerarNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(gerarNonce()).not.toBe(a);
  });

  it("só libera script com o nonce, sem 'unsafe-inline' nem eval na produção", () => {
    const csp = politicaDeSeguranca({ nonce: "abc", https: true });
    const scripts = diretiva(csp, "script-src")!;
    expect(scripts).toContain("'nonce-abc'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(diretiva(csp, "object-src")).toEqual(["'none'"]);
    expect(diretiva(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(diretiva(csp, "base-uri")).toEqual(["'self'"]);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("libera o upload ao R2, o Sentry da DSN e o eval só em desenvolvimento", () => {
    const csp = politicaDeSeguranca({
      nonce: "abc",
      desenvolvimento: true,
      sentryDsn: "https://chave@o123.ingest.us.sentry.io/456",
    });
    expect(diretiva(csp, "script-src")).toContain("'unsafe-eval'");
    const conexoes = diretiva(csp, "connect-src")!;
    expect(conexoes).toContain("https://*.r2.cloudflarestorage.com");
    expect(conexoes).toContain("https://o123.ingest.us.sentry.io");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
