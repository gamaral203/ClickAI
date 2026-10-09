import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assinaturaDoWebhookConfere, TOLERANCIA_TS_WEBHOOK_MS } from "./mercadopago";

const SEGREDO = "segredo-do-webhook-de-teste";
const agora = Date.UTC(2026, 9, 8, 12);

function assinatura(ts: string, dataId = "ord-abc", requestId = "req-1") {
  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", SEGREDO).update(manifesto).digest("hex");
  return { dataId, requestId, assinatura: `ts=${ts},v1=${v1}` };
}

beforeEach(() => {
  vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
  vi.stubEnv("MP_WEBHOOK_SECRET", SEGREDO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assinaturaDoWebhookConfere: idade do ts", () => {
  it("aceita ts atual, em milissegundos ou em segundos", () => {
    expect(assinaturaDoWebhookConfere(assinatura(String(agora)), agora)).toBe(true);
    expect(assinaturaDoWebhookConfere(assinatura(String(agora / 1000)), agora)).toBe(true);
  });

  it("aceita até ~5 minutos de diferença, para o passado ou o futuro", () => {
    const limite = TOLERANCIA_TS_WEBHOOK_MS;
    expect(assinaturaDoWebhookConfere(assinatura(String(agora - limite)), agora)).toBe(true);
    expect(assinaturaDoWebhookConfere(assinatura(String(agora + limite)), agora)).toBe(true);
  });

  it("recusa ts com mais de 5 minutos no passado (notificação repetida)", () => {
    const velho = String(agora - TOLERANCIA_TS_WEBHOOK_MS - 1000);
    expect(assinaturaDoWebhookConfere(assinatura(velho), agora)).toBe(false);
  });

  it("recusa ts com mais de 5 minutos no futuro", () => {
    const futuro = String(agora + TOLERANCIA_TS_WEBHOOK_MS + 1000);
    expect(assinaturaDoWebhookConfere(assinatura(futuro), agora)).toBe(false);
  });

  it("recusa ts que não é número e assinatura que não confere", () => {
    expect(assinaturaDoWebhookConfere(assinatura("abc"), agora)).toBe(false);
    const certa = assinatura(String(agora));
    expect(assinaturaDoWebhookConfere({ ...certa, dataId: "ord-outra" }, agora)).toBe(false);
  });
});
