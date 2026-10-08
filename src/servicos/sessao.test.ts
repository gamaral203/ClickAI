import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  atualizarEvento,
  buscarContaDoFotografo,
  buscarEventoDoFotografo,
  criarUsuario,
  mudarPapelDoUsuario,
  type Papel,
} from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco, schema } from "@/db";
import { eq } from "drizzle-orm";

import { contaDoPainel, podeUsarPainel } from "./sessao";

async function novoUsuario(papel: Papel, nome = "Gestora Teste") {
  return criarUsuario({
    nome,
    email: `${crypto.randomUUID()}@teste.com`,
    senhaHash: null,
    papel,
  });
}

describe("acesso ao painel de fotógrafo", () => {
  it("fotógrafo e gestor usam o painel; cliente não", () => {
    expect(podeUsarPainel({ papel: "fotografo" })).toBe(true);
    expect(podeUsarPainel({ papel: "admin" })).toBe(true);
    expect(podeUsarPainel({ papel: "cliente" })).toBe(false);
  });

  it("gestor sem conta ganha a conta de fotógrafo uma vez só, mesmo com acessos simultâneos", async () => {
    const gestor = await novoUsuario("admin");
    expect(await buscarContaDoFotografo(gestor.id)).toBeNull();

    const contas = await Promise.all(Array.from({ length: 5 }, () => contaDoPainel(gestor)));
    const ids = new Set(contas.map((c) => c?.id));
    expect(ids.size).toBe(1);
    const conta = contas[0]!;
    expect(conta.usuarioId).toBe(gestor.id);
    expect(conta.nomePublico).toBe(gestor.nome);
    expect(conta.cpfCnpj || null).toBeNull();
    expect(conta.chavePix || null).toBeNull();

    // Acessos seguintes devolvem a mesma conta.
    expect((await contaDoPainel(gestor))?.id).toBe(conta.id);
    const banco = await obterBanco();
    const linhas = await banco
      .select()
      .from(schema.fotografos)
      .where(eq(schema.fotografos.usuarioId, gestor.id));
    expect(linhas).toHaveLength(1);
  });

  it("dois gestores com o mesmo nome ganham slugs diferentes", async () => {
    const [a, b] = await Promise.all([
      novoUsuario("admin", "Gestor Homônimo"),
      novoUsuario("admin", "Gestor Homônimo"),
    ]);
    const [ca, cb] = await Promise.all([contaDoPainel(a), contaDoPainel(b)]);
    expect(ca?.slug).toBeTruthy();
    expect(cb?.slug).toBeTruthy();
    expect(ca?.slug).not.toBe(cb?.slug);
  });

  it("gestor não vê nem edita evento de outro fotógrafo", async () => {
    const gestor = await novoUsuario("admin");
    const conta = (await contaDoPainel(gestor))!;
    const alheio = eventos.find((e) => e.fotografoId === fotografos[0].id)!;
    expect(conta.id).not.toBe(alheio.fotografoId);
    expect(await buscarEventoDoFotografo(alheio.id, conta.id)).toBeNull();
    expect(await atualizarEvento(alheio.id, conta.id, { titulo: "Tomado" })).toBeNull();
    expect((await buscarEventoDoFotografo(alheio.id, alheio.fotografoId))?.titulo).toBe(
      alheio.titulo,
    );
  });

  it("cliente comum continua sem painel e sem conta criada", async () => {
    const cliente = await novoUsuario("cliente");
    expect(await contaDoPainel(cliente)).toBeNull();
    expect(await buscarContaDoFotografo(cliente.id)).toBeNull();
  });

  it("fotógrafo continua com a própria conta", async () => {
    const lia = fotografos[0];
    const usuario = await novoUsuario("fotografo");
    // Fotógrafo sem conta (não deveria acontecer) não ganha uma pelo painel: segue como antes.
    expect(await contaDoPainel(usuario)).toBeNull();
    const dono = { ...usuario, id: lia.usuarioId };
    expect((await contaDoPainel(dono))?.id).toBe(lia.id);
  });

  it("gestor rebaixado a cliente perde o painel; a conta de fotógrafo fica", async () => {
    const gestor = await novoUsuario("admin");
    const conta = (await contaDoPainel(gestor))!;
    await mudarPapelDoUsuario(gestor.id, "cliente");
    expect(await contaDoPainel({ ...gestor, papel: "cliente" })).toBeNull();
    expect((await buscarContaDoFotografo(gestor.id))?.id).toBe(conta.id);
  });
});
