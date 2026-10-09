import { randomUUID } from "node:crypto";

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
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

import { criarUsuario, estadoMfa } from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  cifrarSegredo,
  codigoAtual,
  decifrarSegredo,
  gerarCodigosRecuperacao,
  hashCodigoRecuperacao,
  novoSegredoTotp,
  passoDoCodigo,
} from "@/lib/mfa";
import { gerarHashSenha } from "@/lib/senha";

import {
  confirmarCadastroMfa,
  conferirCodigoMfa,
  desligarMfaComCodigo,
  exigirCodigoSeLigado,
  iniciarCadastroMfa,
  novosCodigosRecuperacao,
} from "./mfa";
import {
  concluirLoginComCodigo,
  entrar,
  entrarComGoogle,
  loginPendente,
  sairDeTodosOsDispositivos,
  sessaoAtual,
} from "./sessao";

const SENHA = "senha-do-fotografo-1";
const PASSO_MS = 30_000;

function em(aparelho: string) {
  aparelhos.atual = aparelho;
}

beforeEach(() => {
  aparelhos.potes.clear();
  em("a");
});

/**
 * Fotógrafo com a verificação ligada. O cadastro é confirmado com o código do passo anterior,
 * para que o código atual ainda não tenha sido usado (cada passo vale uma vez só).
 */
async function fotografoComMfa(googleId?: string) {
  const email = `${randomUUID()}@teste.com`;
  const usuario = await criarUsuario({
    nome: "Fotógrafa MFA",
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel: "fotografo",
    googleId,
    emailConfirmado: Boolean(googleId),
  });
  const cadastro = await iniciarCadastroMfa(usuario);
  expect(cadastro?.qrCode.startsWith("data:image/png;base64,")).toBe(true);
  const segredo = cadastro!.segredo.replace(/\s+/g, "");
  const agora = Date.now();
  const ativacao = await confirmarCadastroMfa(
    usuario.id,
    codigoAtual(segredo, agora - PASSO_MS),
    agora,
  );
  if (!ativacao.ok) throw new Error(`ativação falhou: ${ativacao.motivo}`);
  return { usuario, email, segredo, codigos: ativacao.codigos };
}

describe("contas do TOTP e da cifra", () => {
  it("cifra e decifra o segredo, e recusa texto alterado", () => {
    const segredo = novoSegredoTotp();
    const cifrado = cifrarSegredo(segredo);
    expect(cifrado).not.toContain(segredo);
    expect(decifrarSegredo(cifrado)).toBe(segredo);
    const partes = cifrado.split(".");
    partes[3] = Buffer.from("outra coisa").toString("base64url");
    expect(decifrarSegredo(partes.join("."))).toBeNull();
    expect(decifrarSegredo("lixo")).toBeNull();
  });

  it("aceita o código atual e os vizinhos, e recusa o resto", () => {
    const segredo = novoSegredoTotp();
    const agora = Date.now();
    expect(passoDoCodigo(segredo, codigoAtual(segredo, agora), agora)).not.toBeNull();
    expect(passoDoCodigo(segredo, codigoAtual(segredo, agora - PASSO_MS), agora)).not.toBeNull();
    expect(passoDoCodigo(segredo, codigoAtual(segredo, agora - 5 * PASSO_MS), agora)).toBeNull();
    expect(passoDoCodigo(segredo, "12345", agora)).toBeNull();
    expect(passoDoCodigo(segredo, "abcdef", agora)).toBeNull();
  });

  it("gera códigos de recuperação únicos e confere ignorando hífen, espaço e maiúsculas", () => {
    const codigos = gerarCodigosRecuperacao();
    expect(new Set(codigos).size).toBe(10);
    expect(codigos[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    const hash = hashCodigoRecuperacao(codigos[0]);
    expect(hash).toBe(hashCodigoRecuperacao(` ${codigos[0].replace("-", " ").toUpperCase()} `));
    expect(hash).not.toContain(codigos[0].replace("-", ""));
    expect(hashCodigoRecuperacao("curto")).toBeNull();
  });
});

describe("verificação em duas etapas", () => {
  it("cadastro guarda só o segredo cifrado e os hashes dos códigos", async () => {
    const { usuario, segredo, codigos } = await fotografoComMfa();
    expect(codigos).toHaveLength(10);
    const estado = await estadoMfa(usuario.id);
    expect(estado).toMatchObject({ ativo: true, codigosRestantes: 10 });

    const banco = await obterBanco();
    const linhas = await banco.select().from(t.usuarios);
    const linha = linhas.find((u) => u.id === usuario.id)!;
    expect(linha.mfaSegredo).not.toContain(segredo);
    const guardados = (await banco.select().from(t.codigosRecuperacao)).filter(
      (c) => c.usuarioId === usuario.id,
    );
    expect(guardados).toHaveLength(10);
    for (const c of codigos) {
      expect(guardados.some((g) => g.codigoHash.includes(c.replace("-", "")))).toBe(false);
    }
    // Já ligada: não começa outro cadastro por cima.
    expect(await iniciarCadastroMfa(usuario)).toBeNull();
  });

  it("recusa ligar com código errado", async () => {
    const email = `${randomUUID()}@teste.com`;
    const usuario = await criarUsuario({
      nome: "Teste",
      email,
      senhaHash: gerarHashSenha(SENHA),
      papel: "fotografo",
    });
    await iniciarCadastroMfa(usuario);
    expect(await confirmarCadastroMfa(usuario.id, "000000")).toMatchObject({
      ok: false,
    });
    expect((await estadoMfa(usuario.id)).ativo).toBe(false);
  });

  it("o login com senha só abre a sessão depois do código, e o mesmo código não vale duas vezes", async () => {
    const { email, segredo } = await fotografoComMfa();

    const primeira = await entrar(email, SENHA, "/painel/vendas");
    expect(primeira?.pedeCodigo).toBe(true);
    expect(await sessaoAtual()).toBeNull();
    expect((await loginPendente())?.proximo).toBe("/painel/vendas");

    expect(await concluirLoginComCodigo("000000")).toEqual({ ok: false, motivo: "invalido" });
    expect(await sessaoAtual()).toBeNull();

    const codigo = codigoAtual(segredo);
    const certo = await concluirLoginComCodigo(codigo);
    expect(certo).toMatchObject({ ok: true, proximo: "/painel/vendas" });
    expect((await sessaoAtual())?.usuario.email).toBe(email);
    // O cookie da primeira etapa some: não dá para abrir outra sessão com ele.
    expect(await loginPendente()).toBeNull();

    // Outro aparelho tenta com o mesmo código (alguém viu a tela): recusado.
    em("b");
    await entrar(email, SENHA);
    expect(await concluirLoginComCodigo(codigo)).toEqual({ ok: false, motivo: "invalido" });
    expect(await sessaoAtual()).toBeNull();
  });

  it("código de recuperação entra uma vez só", async () => {
    const { email, codigos, usuario } = await fotografoComMfa();
    await entrar(email, SENHA);
    expect(await concluirLoginComCodigo(codigos[0].toUpperCase())).toMatchObject({ ok: true });
    expect((await estadoMfa(usuario.id)).codigosRestantes).toBe(9);

    em("b");
    await entrar(email, SENHA);
    expect(await concluirLoginComCodigo(codigos[0])).toEqual({ ok: false, motivo: "invalido" });
  });

  it("bloqueia depois de 6 códigos errados, mesmo que o próximo esteja certo", async () => {
    const { usuario, email, segredo } = await fotografoComMfa();
    await entrar(email, SENHA);
    for (let i = 0; i < 6; i++) {
      expect(await concluirLoginComCodigo("111111")).toEqual({ ok: false, motivo: "invalido" });
    }
    expect(await concluirLoginComCodigo(codigoAtual(segredo))).toEqual({
      ok: false,
      motivo: "bloqueado",
    });
    expect(await conferirCodigoMfa(usuario.id, codigoAtual(segredo))).toBe("bloqueado");
    expect(await sessaoAtual()).toBeNull();
  });

  it("sair de todos os aparelhos invalida o login que esperava o código", async () => {
    const { usuario, email } = await fotografoComMfa();
    em("b");
    await entrar(email, SENHA);
    expect(await loginPendente()).not.toBeNull();
    em("a");
    await sairDeTodosOsDispositivos(usuario.id);
    em("b");
    expect(await loginPendente()).toBeNull();
    expect(await concluirLoginComCodigo("123456")).toEqual({ ok: false, motivo: "expirado" });
  });

  it("o login com o Google também pede o código", async () => {
    const googleId = `g-${randomUUID()}`;
    const { email, segredo } = await fotografoComMfa(googleId);
    const resultado = await entrarComGoogle({ googleId, email, nome: "Fotógrafa MFA" }, false);
    expect(resultado).toMatchObject({ ok: true, pedeCodigo: true });
    expect(await sessaoAtual()).toBeNull();
    const fim = await concluirLoginComCodigo(codigoAtual(segredo));
    expect(fim.ok).toBe(true);
    expect((await sessaoAtual())?.metodo).toBe("google");
  });

  it("ações sensíveis passam direto sem a verificação e pedem o código com ela", async () => {
    expect(await exigirCodigoSeLigado({ id: randomUUID(), mfaAtivo: false }, undefined)).toBe("ok");
    const { usuario, segredo } = await fotografoComMfa();
    const comMfa = { id: usuario.id, mfaAtivo: true };
    expect(await exigirCodigoSeLigado(comMfa, "")).toBe("faltando");
    expect(await exigirCodigoSeLigado(comMfa, "999999")).toBe("invalido");
    expect(await exigirCodigoSeLigado(comMfa, codigoAtual(segredo))).toBe("ok");
  });

  it("gera códigos novos e desliga só com código válido", async () => {
    const { usuario, segredo, codigos } = await fotografoComMfa();
    expect(await novosCodigosRecuperacao(usuario.id, "000000")).toMatchObject({ ok: false });
    const novos = await novosCodigosRecuperacao(usuario.id, codigos[1]);
    if (!novos.ok) throw new Error("devia gerar");
    // Os antigos deixam de valer.
    expect(await conferirCodigoMfa(usuario.id, codigos[2])).toBe("invalido");

    expect(await desligarMfaComCodigo(usuario.id, "000000")).toBe("invalido");
    expect((await estadoMfa(usuario.id)).ativo).toBe(true);
    expect(await desligarMfaComCodigo(usuario.id, codigoAtual(segredo))).toBe("ok");
    expect(await estadoMfa(usuario.id)).toMatchObject({ ativo: false, codigosRestantes: 0 });
  });
});
