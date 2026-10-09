import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.21" }),
}));

import { trocarSenhaAcao } from "@/app/(cliente)/conta/seguranca/acoes";
import { buscarUsuarioParaLogin, criarUsuario, listarMensagens } from "@/dados";
import { codigoAtual } from "@/lib/mfa";
import { gerarHashSenha } from "@/lib/senha";

import { confirmarCadastroMfa, iniciarCadastroMfa } from "./mfa";
import { entrar, sessaoAtual, usuarioAtual, type SessaoAtual } from "./sessao";
import { LOGIN_GOOGLE_RECENTE_MS } from "./troca-documento";
import { situacaoDaSenha, trocarSenha } from "./troca-senha";

const SENHA = "senha-antiga-123";
const NOVA = "senha-nova-456";

function em(aparelho: string) {
  aparelhos.atual = aparelho;
}

/** Usuário com senha, logado nos aparelhos "a" e "b"; o teste segue no "a". */
async function usuarioLogado(papel: "cliente" | "fotografo" = "cliente") {
  const email = `${randomUUID()}@teste.com`;
  const usuario = await criarUsuario({
    nome: "Pessoa Teste",
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel,
  });
  em("b");
  await entrar(email, SENHA);
  em("a");
  await entrar(email, SENHA);
  const sessao = (await sessaoAtual())!;
  return { usuario, email, sessao };
}

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

beforeEach(() => {
  aparelhos.potes.clear();
  em("a");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("troca de senha", () => {
  it("recusa a senha atual errada sem trocar nada nem derrubar sessões", async () => {
    const { email, sessao } = await usuarioLogado();
    const antes = (await buscarUsuarioParaLogin(email))!.senhaHash;
    expect(await trocarSenha(sessao, { senhaAtual: "errada-123", novaSenha: NOVA })).toEqual({
      ok: false,
      motivo: "senha",
    });
    expect(await trocarSenha(sessao, { senhaAtual: null, novaSenha: NOVA })).toEqual({
      ok: false,
      motivo: "senha",
    });
    expect((await buscarUsuarioParaLogin(email))!.senhaHash).toBe(antes);
    em("b");
    expect(await usuarioAtual()).not.toBeNull();
  });

  it("recusa a nova senha igual à atual (no serviço e na ação)", async () => {
    const { sessao } = await usuarioLogado();
    expect(await trocarSenha(sessao, { senhaAtual: SENHA, novaSenha: SENHA })).toEqual({
      ok: false,
      motivo: "igual",
    });
    const estado = await trocarSenhaAcao(
      {},
      formulario({ senhaAtual: SENHA, novaSenha: SENHA, confirmacao: SENHA }),
    );
    expect(estado.erros?.novaSenha).toMatch(/diferente da atual/);
  });

  it("recusa a confirmação diferente e a senha curta, com a regra do cadastro", async () => {
    await usuarioLogado();
    const diferente = await trocarSenhaAcao(
      {},
      formulario({ senhaAtual: SENHA, novaSenha: NOVA, confirmacao: `${NOVA}x` }),
    );
    expect(diferente.erros?.confirmacao).toMatch(/não é igual/);
    const curta = await trocarSenhaAcao(
      {},
      formulario({ senhaAtual: SENHA, novaSenha: "curta", confirmacao: "curta" }),
    );
    expect(curta.erros?.novaSenha).toMatch(/pelo menos 8/);
  });

  it("troca, mantém esta sessão, derruba as outras e avisa por e-mail sem a senha", async () => {
    const { usuario, email } = await usuarioLogado();
    const estado = await trocarSenhaAcao(
      {},
      formulario({ senhaAtual: SENHA, novaSenha: NOVA, confirmacao: NOVA }),
    );
    expect(estado.ok).toMatch(/Senha trocada/);

    // Este aparelho continua logado (cookie reemitido com a versão nova); o outro caiu.
    expect((await usuarioAtual())?.id).toBe(usuario.id);
    em("b");
    expect(await usuarioAtual()).toBeNull();

    // A senha antiga não entra mais; a nova entra.
    em("c");
    expect(await entrar(email, SENHA)).toBeNull();
    expect((await entrar(email, NOVA))?.usuario.id).toBe(usuario.id);

    const aviso = (await listarMensagens(1000)).find(
      (m) => m.para === email && m.tipo === "seguranca",
    );
    expect(aviso?.assunto).toMatch(/senha/i);
    expect(aviso?.texto).not.toContain(NOVA);
    expect(aviso?.texto).not.toContain(SENHA);
  });

  it("com a verificação em duas etapas ligada, exige o código do app", async () => {
    const { usuario, email } = await usuarioLogado("fotografo");
    const cadastro = await iniciarCadastroMfa(usuario);
    const segredo = cadastro!.segredo.replace(/\s+/g, "");
    const agora = Date.now();
    const ativacao = await confirmarCadastroMfa(usuario.id, codigoAtual(segredo, agora), agora);
    if (!ativacao.ok) throw new Error(`ativação falhou: ${ativacao.motivo}`);
    const sessao = (await sessaoAtual())!;
    expect(sessao.usuario.mfaAtivo).toBe(true);
    const antes = (await buscarUsuarioParaLogin(email))!.senhaHash;

    const pedido = { senhaAtual: SENHA, novaSenha: NOVA };
    expect(await trocarSenha(sessao, pedido)).toEqual({ ok: false, motivo: "codigo_faltando" });
    expect(await trocarSenha(sessao, { ...pedido, codigoMfa: "000000" })).toMatchObject({
      ok: false,
      motivo: "codigo_invalido",
    });
    expect((await buscarUsuarioParaLogin(email))!.senhaHash).toBe(antes);

    // A ação mostra o pedido do código no campo certo.
    const estado = await trocarSenhaAcao(
      {},
      formulario({ senhaAtual: SENHA, novaSenha: NOVA, confirmacao: NOVA }),
    );
    expect(estado.erros?.codigoMfa).toMatch(/código/);

    expect(await trocarSenha(sessao, { ...pedido, codigoMfa: ativacao.codigos[0] })).toEqual({
      ok: true,
      criada: false,
    });
    expect((await usuarioAtual())?.id).toBe(usuario.id);
  });

  it("bloqueia depois de 8 tentativas, com o limite do login, mesmo com a senha certa", async () => {
    const { email, sessao } = await usuarioLogado();
    const antes = (await buscarUsuarioParaLogin(email))!.senhaHash;
    for (let i = 0; i < 8; i++) {
      expect(await trocarSenha(sessao, { senhaAtual: `errada-${i}`, novaSenha: NOVA })).toEqual({
        ok: false,
        motivo: "senha",
      });
    }
    expect(await trocarSenha(sessao, { senhaAtual: SENHA, novaSenha: NOVA })).toEqual({
      ok: false,
      motivo: "bloqueado",
    });
    expect((await buscarUsuarioParaLogin(email))!.senhaHash).toBe(antes);
  });

  it("conta só com o Google cria a senha só com um login recente com o Google", async () => {
    const email = `${randomUUID()}@teste.com`;
    const usuario = await criarUsuario({
      nome: "Só Google",
      email,
      senhaHash: null,
      papel: "cliente",
      googleId: randomUUID(),
      emailConfirmado: true,
    });
    expect(await situacaoDaSenha(usuario)).toBe("so_google");
    const agora = Date.now();
    const sessao = (metodo: SessaoAtual["metodo"], atrasMs: number): SessaoAtual => ({
      usuario,
      metodo,
      entrouEm: agora - atrasMs,
    });

    expect(
      await trocarSenha(sessao("google", LOGIN_GOOGLE_RECENTE_MS + 1), { novaSenha: NOVA }, agora),
    ).toEqual({ ok: false, motivo: "google_antigo" });
    expect(await trocarSenha(sessao("senha", 0), { novaSenha: NOVA }, agora)).toEqual({
      ok: false,
      motivo: "google_antigo",
    });

    expect(await trocarSenha(sessao("google", 60_000), { novaSenha: NOVA }, agora)).toEqual({
      ok: true,
      criada: true,
    });
    expect(await situacaoDaSenha(usuario)).toBe("com_senha");
    em("c");
    expect((await entrar(email, NOVA))?.usuario.id).toBe(usuario.id);
  });

  it("não troca a senha de gestor definido em GESTORES", async () => {
    const { email, sessao } = await usuarioLogado();
    vi.stubEnv(
      "GESTORES",
      JSON.stringify([{ email, nome: "Gestor", senhaHash: gerarHashSenha(SENHA) }]),
    );
    expect(await situacaoDaSenha({ email })).toBe("gestor_ambiente");
    expect(await trocarSenha(sessao, { senhaAtual: SENHA, novaSenha: NOVA })).toEqual({
      ok: false,
      motivo: "gestor_ambiente",
    });
  });
});
