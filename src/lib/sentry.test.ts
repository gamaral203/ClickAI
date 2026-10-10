import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { limparEvento, limparTexto } from "./sentry";

describe("limpeza dos eventos do Sentry", () => {
  it("apaga tokens da URL e mantém o resto", () => {
    expect(limparTexto("/pedidos/abc?token=SEGREDO123&x=1")).toBe(
      "/pedidos/abc?token=[removido]&x=1",
    );
    expect(limparTexto("/api/auth/google/callback?code=abc&state=def")).toBe(
      "/api/auth/google/callback?code=[removido]&state=[removido]",
    );
    // Link de "Esqueci a senha": o token vai depois do #.
    expect(limparTexto("https://clicouai.com/entrar/nova-senha#token=abcDEF_123-xyz")).toBe(
      "https://clicouai.com/entrar/nova-senha#token=[removido]",
    );
    // URL assinada do R2 (originais que o dono baixa) e a liberação do download do dono.
    expect(
      limparTexto(
        "https://b.r2.cloudflarestorage.com/originais/a.jpg?X-Amz-Credential=AK%2F2026&X-Amz-Expires=900&X-Amz-Signature=abc123",
      ),
    ).toBe(
      "https://b.r2.cloudflarestorage.com/originais/a.jpg?X-Amz-Credential=[removido]&X-Amz-Expires=900&X-Amz-Signature=[removido]",
    );
    expect(limparTexto("/api/painel/originais/e/f?modo=minhas&liberacao=abc.def")).toBe(
      "/api/painel/originais/e/f?modo=minhas&liberacao=[removido]",
    );
    expect(limparTexto("/eventos/corrida?hora=2026-09-27T07")).toBe(
      "/eventos/corrida?hora=2026-09-27T07",
    );
  });

  it("tira corpo, cookies, Authorization e dados do usuário", () => {
    const evento = limparEvento({
      type: undefined,
      message: "Falhou em /pedidos/1?token=ABC",
      request: {
        url: "https://clicouai.com.br/pedidos/1?token=ABC",
        query_string: "token=ABC",
        headers: { cookie: "clicouai_sessao=x", Authorization: "Bearer y", "user-agent": "z" },
        cookies: { clicouai_sessao: "x" },
        data: "selfie em base64",
      },
      breadcrumbs: [{ message: "fetch", data: { url: "/api/download/1?token=ABC" } }],
      user: { id: "u1", email: "ana@exemplo.com", ip_address: "1.2.3.4" },
    } as ErrorEvent);

    expect(evento.request?.data).toBeUndefined();
    expect(evento.request?.cookies).toBeUndefined();
    expect(evento.request?.headers).toEqual({ "user-agent": "z" });
    expect(evento.request?.url).not.toContain("ABC");
    expect(evento.request?.query_string).toBe("token=[removido]");
    expect(evento.breadcrumbs?.[0].data?.url).toBe("/api/download/1?token=[removido]");
    expect(evento.message).not.toContain("ABC");
    expect(evento.user).toEqual({ id: "u1" });
  });
});
