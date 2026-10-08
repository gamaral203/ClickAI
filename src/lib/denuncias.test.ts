import { describe, expect, it } from "vitest";

import { lerLinkDoConteudo } from "./denuncias";

const ID = "3f1c2b9a-0d4e-4a7b-9c11-2e5f6a7b8c9d";

describe("link do pedido de remoção", () => {
  it("aceita a página da foto e a do evento, com ou sem domínio", () => {
    expect(lerLinkDoConteudo(`https://clicouai.com.br/fotos/${ID}`)).toEqual({
      tipo: "foto",
      id: ID,
    });
    expect(lerLinkDoConteudo(`/fotos/${ID.toUpperCase()}?x=1#topo`)).toEqual({
      tipo: "foto",
      id: ID,
    });
    expect(lerLinkDoConteudo("  clicouai-hazel.vercel.app/eventos/corrida-10k  ")).toEqual({
      tipo: "evento",
      slug: "corrida-10k",
    });
    expect(lerLinkDoConteudo("https://clicouai-hazel.vercel.app/eventos/corrida-10k/")).toEqual({
      tipo: "evento",
      slug: "corrida-10k",
    });
  });

  it("recusa qualquer outra coisa", () => {
    expect(lerLinkDoConteudo("")).toBeNull();
    expect(lerLinkDoConteudo("/fotos/123")).toBeNull();
    expect(lerLinkDoConteudo(`/fotos/${ID}/extra`)).toBeNull();
    expect(lerLinkDoConteudo("/eventos/Corrida_10K")).toBeNull();
    expect(lerLinkDoConteudo("/painel/eventos")).toBeNull();
    expect(lerLinkDoConteudo("javascript:alert(1)")).toBeNull();
    expect(lerLinkDoConteudo("x".repeat(600))).toBeNull();
  });
});
