import { describe, expect, it, vi } from "vitest";

// `headers()` só existe dentro de uma requisição do Next; aqui o IP vem fixo.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

import { obterBanco, schema } from "@/db";

import { limiteAtingido, limiteDoIpAtingido } from "./limites";

describe("limite de tentativas no banco", () => {
  it("bloqueia depois do limite da regra e não grava o valor em claro", async () => {
    const usuario = crypto.randomUUID();
    // email_confirmacao_usuario: 3 por hora.
    const resultados = [];
    for (let i = 0; i < 5; i++) {
      resultados.push(await limiteAtingido("email_confirmacao_usuario", usuario));
    }
    expect(resultados).toEqual([false, false, false, true, true]);

    // Outra conta tem a própria contagem.
    expect(await limiteAtingido("email_confirmacao_usuario", crypto.randomUUID())).toBe(false);

    const banco = await obterBanco();
    const chaves = (await banco.select().from(schema.tentativas)).map((t) => t.chave);
    expect(chaves.some((c) => c.includes(usuario))).toBe(false);
    expect(chaves.every((c) => /^[0-9a-f]{64}$/.test(c))).toBe(true);
  });

  it("conta pelo primeiro IP da requisição, separado por regra", async () => {
    for (let i = 0; i < 10; i++) expect(await limiteDoIpAtingido("busca_facial_ip")).toBe(false);
    expect(await limiteDoIpAtingido("busca_facial_ip")).toBe(true);
    // A regra do download tem contagem própria para o mesmo IP.
    expect(await limiteAtingido("url_download_ip", "203.0.113.7")).toBe(false);
  });

  it("segura o teste de cartão: 10 tentativas de pagamento por IP por hora", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 10; i++) expect(await limiteAtingido("cartao_ip", ip)).toBe(false);
    expect(await limiteAtingido("cartao_ip", ip)).toBe(true);
  });
});
