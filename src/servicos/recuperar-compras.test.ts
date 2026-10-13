import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
// O limite por IP lê os cabeçalhos da requisição.
const ip = vi.hoisted(() => ({ valor: "203.0.113.50" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": ip.valor }),
}));

import { comprasPagasDoEmail, listarMensagens } from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { emailDoLinkDasCompras, enviarLinkDasCompras, linkDasCompras } from "./recuperar-compras";

// "Recuperar minhas compras": o link das compras vai só para o e-mail que comprou, e a resposta
// é a mesma tendo compra ou não.

async function pedido(email: string, status: "pago" | "pendente" | "estornado") {
  const banco = await obterBanco();
  const [p] = await banco
    .insert(t.pedidos)
    .values({
      nomeComprador: "Vyrna Andrade",
      emailComprador: email,
      subtotalCentavos: 6000,
      descontoCentavos: 0,
      totalCentavos: 6000,
      metodo: "pix",
      status,
      expiraEm: new Date(Date.now() + 3_600_000),
      pagoEm: status === "pendente" ? null : new Date(),
    })
    .returning({ id: t.pedidos.id });
  return p.id;
}

function novoEmail() {
  return `vyrna-${randomUUID().slice(0, 8)}@teste.com`;
}

describe("recuperar minhas compras", () => {
  it("com compra paga, manda ao e-mail o link da lista; o link abre só as compras pagas", async () => {
    ip.valor = "203.0.113.51";
    const email = novoEmail();
    const pago = await pedido(email.toUpperCase(), "pago");
    await pedido(email, "pendente");
    await pedido(email, "estornado");

    expect(await enviarLinkDasCompras(` ${email} `)).toEqual({ ok: true });
    const enviada = (await listarMensagens(500)).find(
      (m) => m.para === email && m.assunto === "Suas compras no ClicouAí",
    );
    expect(enviada?.pedidoId).toBe(pago);
    const token = /token=([^\s]+)/.exec(enviada!.texto)?.[1];
    expect(token && emailDoLinkDasCompras(token)).toBe(email);
    expect((await comprasPagasDoEmail(email)).map((c) => c.pedidoId)).toEqual([pago]);
  });

  it("sem compra paga, responde igual e não manda nada", async () => {
    ip.valor = "203.0.113.52";
    const email = novoEmail();
    await pedido(email, "pendente");
    expect(await enviarLinkDasCompras(email)).toEqual({ ok: true });
    expect((await listarMensagens(500)).some((m) => m.para === email)).toBe(false);
  });

  it("e-mail inválido, link alterado e excesso de pedidos são recusados", async () => {
    ip.valor = "203.0.113.53";
    expect(await enviarLinkDasCompras("sem-arroba")).toEqual({
      ok: false,
      erro: "Digite um e-mail válido.",
    });
    expect(emailDoLinkDasCompras("token-falso-que-nao-confere")).toBeNull();
    const link = new URL(linkDasCompras("a@b.com"));
    expect(emailDoLinkDasCompras(link.searchParams.get("token")!.slice(0, -2) + "xx")).toBeNull();

    const email = novoEmail();
    for (let i = 0; i < 3; i++) expect((await enviarLinkDasCompras(email)).ok).toBe(true);
    expect(await enviarLinkDasCompras(email)).toEqual({
      ok: false,
      erro: "Muitos pedidos seguidos. Espere alguns minutos e tente de novo.",
    });
  });
});
