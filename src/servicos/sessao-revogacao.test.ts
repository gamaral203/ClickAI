import { beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

// Cada "aparelho" é um pote de cookies; o teste escolhe qual está fazendo a requisição.
const aparelhos = vi.hoisted(() => ({
  atual: "a",
  potes: new Map<string, Map<string, string>>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    const pote = aparelhos.potes.get(aparelhos.atual) ?? new Map<string, string>();
    aparelhos.potes.set(aparelhos.atual, pote);
    return {
      get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
      set: (nome: string, valor: string) => pote.set(nome, valor),
      delete: (nome: string) => pote.delete(nome),
    };
  },
}));

import { apagarSessoesRevogadasVencidas, criarUsuario } from "@/dados";
import { gerarHashSenha } from "@/lib/senha";

import {
  encerrarOutrasSessoes,
  entrar,
  sair,
  sairDeTodosOsDispositivos,
  sessaoAtual,
  usuarioAtual,
} from "./sessao";

const SENHA = "senha-de-teste-123";

async function novaConta() {
  const email = `${crypto.randomUUID()}@teste.com`;
  const usuario = await criarUsuario({
    nome: "Pessoa Teste",
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel: "cliente",
  });
  return { usuario, email };
}

function em(aparelho: string) {
  aparelhos.atual = aparelho;
}

/** Cookie de sessão do aparelho (para simular alguém que copiou o cookie). */
function cookieDe(aparelho: string) {
  return new Map(aparelhos.potes.get(aparelho));
}

beforeEach(() => {
  aparelhos.potes.clear();
  em("a");
});

describe("sair encerra a sessão no servidor", () => {
  it("o cookie de quem saiu não vale mais, mesmo copiado antes", async () => {
    const { email } = await novaConta();
    await entrar(email, SENHA);
    expect(await usuarioAtual()).not.toBeNull();

    // Alguém copiou o cookie deste aparelho.
    aparelhos.potes.set("copia", cookieDe("a"));

    await sair();
    expect(await usuarioAtual()).toBeNull();
    em("copia");
    expect(await usuarioAtual()).toBeNull();
  });

  it("sair num aparelho não derruba o outro", async () => {
    const { email } = await novaConta();
    await entrar(email, SENHA);
    em("b");
    await entrar(email, SENHA);

    em("a");
    await sair();
    em("b");
    expect(await usuarioAtual()).not.toBeNull();
  });

  it("sair de todos os dispositivos derruba todas as sessões; entrar de novo funciona", async () => {
    const { usuario, email } = await novaConta();
    await entrar(email, SENHA);
    em("b");
    await entrar(email, SENHA);

    await sairDeTodosOsDispositivos(usuario.id);
    expect(await usuarioAtual()).toBeNull();
    em("a");
    expect(await usuarioAtual()).toBeNull();

    await entrar(email, SENHA);
    expect((await usuarioAtual())?.id).toBe(usuario.id);
  });

  it("encerrar as outras sessões mantém esta, com a mesma hora de login", async () => {
    const { usuario, email } = await novaConta();
    await entrar(email, SENHA);
    const antes = await sessaoAtual();
    em("b");
    await entrar(email, SENHA);

    em("a");
    await encerrarOutrasSessoes(usuario.id);
    const depois = await sessaoAtual();
    expect(depois?.usuario.id).toBe(usuario.id);
    expect(depois?.entrouEm).toBe(antes?.entrouEm);
    expect(depois?.metodo).toBe("senha");
    em("b");
    expect(await usuarioAtual()).toBeNull();
  });

  it("a limpeza tira da lista só as sessões que já venceriam", async () => {
    const { email } = await novaConta();
    await entrar(email, SENHA);
    aparelhos.potes.set("copia", cookieDe("a"));
    await sair();
    await apagarSessoesRevogadasVencidas(Date.now());
    em("copia");
    expect(await usuarioAtual()).toBeNull();
  });
});
