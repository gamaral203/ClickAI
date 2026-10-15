import { describe, expect, it, vi } from "vitest";

// `headers()` só existe dentro de uma requisição do Next; aqui o IP vem fixo.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

import { contadoresDeHoje } from "@/dados";
import { obterBanco, schema } from "@/db";

import { contadorDeBloqueio, limiteAtingido, limiteDoIpAtingido } from "./limites";

describe("limite de tentativas no banco", () => {
  it("bloqueia depois do limite da regra e não grava o valor em claro", async () => {
    const usuario = crypto.randomUUID();
    // esqueci_senha_email: 3 por hora.
    const resultados = [];
    for (let i = 0; i < 5; i++) {
      resultados.push(await limiteAtingido("esqueci_senha_email", usuario));
    }
    expect(resultados).toEqual([false, false, false, true, true]);

    // Outra conta tem a própria contagem.
    expect(await limiteAtingido("esqueci_senha_email", crypto.randomUUID())).toBe(false);

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

describe("limites contra raspagem das prévias", () => {
  it("galeria, página da foto e busca por número têm limite por IP, generoso para CGNAT", async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 120; i++) {
      expect(await limiteAtingido("busca_numero_ip", `${ip}:corrida`)).toBe(false);
    }
    expect(await limiteAtingido("busca_numero_ip", `${ip}:corrida`)).toBe(true);
    // Outro evento, contagem própria.
    expect(await limiteAtingido("busca_numero_ip", `${ip}:festa`)).toBe(false);
    for (let i = 0; i < 600; i++) expect(await limiteAtingido("galeria_ip", ip)).toBe(false);
    expect(await limiteAtingido("galeria_ip", ip)).toBe(true);
    // A página da foto conta à parte.
    expect(await limiteAtingido("foto_ip", ip)).toBe(false);
  });

  it("o bloqueio vai para o log só com a regra e soma no contador do dia, sem o IP", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    const antes = (await contadoresDeHoje([contadorDeBloqueio("denuncia_ip")]))[
      "limite:denuncia_ip"
    ];
    for (let i = 0; i < 5; i++) await limiteAtingido("denuncia_ip", ip);
    expect(aviso).not.toHaveBeenCalled();
    expect(await limiteAtingido("denuncia_ip", ip)).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
    const mensagem = aviso.mock.calls.flat().map(String).join(" ");
    expect(mensagem).toContain("denuncia_ip");
    expect(mensagem).not.toContain(ip);
    const depois = (await contadoresDeHoje([contadorDeBloqueio("denuncia_ip")]))[
      "limite:denuncia_ip"
    ];
    expect(depois).toBe(antes + 1);
    const banco = await obterBanco();
    const contadores = await banco.select().from(schema.contadoresUso);
    expect(contadores.some((c) => c.chave.includes(ip))).toBe(false);
    aviso.mockRestore();
  });
});
