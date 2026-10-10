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

  it("sem a chave do Google Maps, não libera nenhum host do Google Maps", () => {
    const csp = politicaDeSeguranca({ nonce: "abc", https: true });
    expect(csp).not.toContain("maps.googleapis.com");
    expect(csp).not.toContain("*.googleapis.com");
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
  });

  it("com a chave do Google Maps, libera o script, as chamadas e as fontes do mapa", () => {
    const csp = politicaDeSeguranca({ nonce: "abc", https: true, googleMaps: true });
    const scripts = diretiva(csp, "script-src")!;
    expect(scripts).toContain("https://maps.googleapis.com");
    // Continua exigindo o nonce: o host sozinho não libera script injetado.
    expect(scripts).toContain("'nonce-abc'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(diretiva(csp, "connect-src")).toContain("https://*.googleapis.com");
    expect(diretiva(csp, "style-src")).toContain("https://fonts.googleapis.com");
    expect(diretiva(csp, "font-src")).toContain("https://fonts.gstatic.com");
    // Os blocos do mapa são imagens de *.googleapis.com e *.gstatic.com, já cobertos por https:.
    expect(diretiva(csp, "img-src")).toContain("https:");
    expect(diretiva(csp, "worker-src")).toContain("blob:");
    expect(diretiva(csp, "frame-ancestors")).toEqual(["'none'"]);
  });
});
