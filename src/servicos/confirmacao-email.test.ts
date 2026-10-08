import { afterEach, describe, expect, it, vi } from "vitest";

import { destinoSemEnvio, tokenDeExemplo } from "./confirmacao-email";

const TOKEN = "abcdefghijklmnopqrstuvwxyz_0123456789-AB";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("link de confirmação quando o e-mail não sai", () => {
  it("na produção, a URL não leva o token e o erro vai ao log sem o token", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = destinoSemEnvio(TOKEN, "/minhas-compras");
    expect(url).not.toContain(TOKEN);
    expect(url).not.toContain("token");
    expect(url).toBe("/conta/confirmar-email?indisponivel=1&proximo=%2Fminhas-compras");
    expect(erro).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(erro.mock.calls)).not.toContain(TOKEN);
  });

  it("na produção, a tela nunca mostra o link, mesmo com o token na URL", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(tokenDeExemplo(TOKEN)).toBeNull();
  });

  it("fora da produção (exemplo e preview), mostra o link para testar sem o Resend", () => {
    for (const ambiente of ["", "preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", ambiente);
      expect(destinoSemEnvio(TOKEN, "/")).toBe(
        `/conta/confirmar-email?token=${TOKEN}&proximo=%2F`,
      );
      expect(tokenDeExemplo(TOKEN)).toBe(TOKEN);
    }
  });

  it("token malformado não vira link", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(tokenDeExemplo("curto")).toBeNull();
    expect(tokenDeExemplo(["a", "b"])).toBeNull();
    expect(tokenDeExemplo(`${TOKEN}"><script>`)).toBeNull();
  });
});
