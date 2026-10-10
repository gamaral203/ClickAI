import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

// Cada "aparelho" é um pote de cookies; cada teste sai de um IP próprio (limites por IP).
const ambiente = vi.hoisted(() => ({
  atual: "a",
  ip: "203.0.113.1",
  potes: new Map<string, Map<string, string>>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    const pote = ambiente.potes.get(ambiente.atual) ?? new Map<string, string>();
    ambiente.potes.set(ambiente.atual, pote);
    return {
      get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
      set: (nome: string, valor: string) => pote.set(nome, valor),
      delete: (nome: string) => pote.delete(nome),
    };
  },
  headers: async () => new Headers({ "x-forwarded-for": ambiente.ip }),
}));

import { eq } from "drizzle-orm";

import { buscarCodigoDeLogin, criarUsuario, type Papel } from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { codigoAtual } from "@/lib/mfa";
import { gerarHashSenha } from "@/lib/senha";

import {
  conferirCodigoDeLogin,
  hashDoCodigoDeLogin,
  MAXIMO_REENVIOS_CODIGO_LOGIN,
  VALIDADE_CODIGO_LOGIN_MS,
  verificacaoPorEmailAtiva,
} from "./codigo-login";
import { confirmarCadastroMfa, iniciarCadastroMfa } from "./mfa";
import {
  concluirLoginComCodigo,
  entrar,
  entrarComGoogle,
  loginPendente,
  reenviarCodigoDoLoginPendente,
  sessaoAtual,
} from "./sessao";

const SENHA = "senha-do-gestor-123";
const PASSO_MS = 30_000;

/** Códigos que o modo de desenvolvimento escreveu no log (sem o Resend). */
let log: ReturnType<typeof vi.spyOn>;
function codigos(): string[] {
  return log.mock.calls
    .map((args: unknown[]) => /código (\d{6})/.exec(String(args[0]))?.[1])
    .filter((c: string | undefined): c is string => Boolean(c));
}
function ultimoCodigo() {
  const lista = codigos();
  return lista[lista.length - 1];
}
/** Um código de 6 dígitos diferente do certo. */
function errado(certo: string) {
  return certo === "000000" ? "111111" : "000000";
}

function em(aparelho: string) {
  ambiente.atual = aparelho;
}

async function novaConta(papel: Papel, googleId?: string) {
  const email = `${papel}-${randomUUID().slice(0, 8)}@teste.com`;
  const usuario = await criarUsuario({
    nome: "Pessoa Teste",
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel,
    googleId,
    emailConfirmado: true,
  });
  return { usuario, email };
}

/** Liga o app autenticador da conta (confirmado com o código do passo anterior). */
async function ligarApp(usuarioId: string, email: string) {
  const cadastro = await iniciarCadastroMfa({ id: usuarioId, email });
  const segredo = cadastro!.segredo.replace(/\s+/g, "");
  const agora = Date.now();
  const ativacao = await confirmarCadastroMfa(
    usuarioId,
    codigoAtual(segredo, agora - PASSO_MS),
    agora,
  );
  if (!ativacao.ok) throw new Error(`ativação falhou: ${ativacao.motivo}`);
  return segredo;
}

beforeEach(() => {
  ambiente.potes.clear();
  em("a");
  ambiente.ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_REMETENTE", "");
  vi.stubEnv("VERCEL_ENV", "");
  // Segredo fixo: os testes de produção exigem um (e o do app autenticador cifra com ele).
  vi.stubEnv("APP_SECRET", "segredo-de-teste-com-mais-de-32-caracteres");
  log = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("código por e-mail no login do gestor", () => {
  it("a senha certa não abre a sessão; o código certo abre e vale uma vez só", async () => {
    const { usuario, email } = await novaConta("admin");
    const resultado = await entrar(email, SENHA, "/admin/saques");
    expect(resultado).toMatchObject({ pedeCodigo: true, envioCodigo: { ok: true } });
    expect(await sessaoAtual()).toBeNull();

    const pendente = await loginPendente();
    expect(pendente?.usuario.id).toBe(usuario.id);
    expect(pendente?.loginId).toBeTruthy();
    expect(pendente?.proximo).toBe("/admin/saques");

    // O banco guarda só o hash, ligado a este login, com validade de 10 minutos.
    const codigo = ultimoCodigo();
    expect(codigo).toMatch(/^\d{6}$/);
    const linha = await buscarCodigoDeLogin(usuario.id);
    expect(linha?.codigoHash).toBe(hashDoCodigoDeLogin(usuario.id, pendente!.loginId!, codigo));
    expect(JSON.stringify(linha)).not.toContain(codigo);
    expect(linha!.expiraEm - linha!.enviadoEm).toBe(VALIDADE_CODIGO_LOGIN_MS);

    // O código nunca vai para a caixa de saída de /admin/mensagens.
    const banco = await obterBanco();
    expect(await banco.select().from(t.mensagens).where(eq(t.mensagens.para, email))).toEqual([]);

    const fim = await concluirLoginComCodigo(codigo);
    expect(fim).toMatchObject({ ok: true, proximo: "/admin/saques" });
    const sessao = await sessaoAtual();
    expect(sessao?.usuario.papel).toBe("admin");
    expect(sessao?.metodo).toBe("senha");
    // O cookie da primeira etapa e o código somem.
    expect(await loginPendente()).toBeNull();
    expect(await buscarCodigoDeLogin(usuario.id)).toBeNull();
    expect(await concluirLoginComCodigo(codigo)).toEqual({ ok: false, motivo: "expirado" });

    // Outro aparelho, outro login: o código antigo não serve.
    em("b");
    await entrar(email, SENHA);
    expect(await concluirLoginComCodigo(codigo)).toMatchObject({
      ok: false,
      motivo: "invalido_email",
    });
    expect(await sessaoAtual()).toBeNull();
  });

  it("cinco códigos errados invalidam o código; só um código novo serve", async () => {
    const { email } = await novaConta("admin");
    await entrar(email, SENHA);
    const codigo = ultimoCodigo();
    for (let restantes = 4; restantes >= 1; restantes--) {
      expect(await concluirLoginComCodigo(errado(codigo))).toEqual({
        ok: false,
        motivo: "invalido_email",
        restantes,
      });
    }
    expect(await concluirLoginComCodigo(errado(codigo))).toEqual({
      ok: false,
      motivo: "codigo_bloqueado",
    });
    // Nem o certo passa depois disso.
    expect(await concluirLoginComCodigo(codigo)).toEqual({ ok: false, motivo: "codigo_bloqueado" });
    expect(await sessaoAtual()).toBeNull();

    // Um código novo (depois da espera de 60 segundos) volta a valer.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(await reenviarCodigoDoLoginPendente()).toEqual({ ok: true });
    expect(await concluirLoginComCodigo(ultimoCodigo())).toMatchObject({ ok: true });
    expect((await sessaoAtual())?.usuario.email).toBe(email);
  });

  it("código vencido é recusado", async () => {
    const { usuario, email } = await novaConta("admin");
    await entrar(email, SENHA);
    const codigo = ultimoCodigo();
    const { loginId } = (await loginPendente())!;
    const depois = Date.now() + VALIDADE_CODIGO_LOGIN_MS + 1000;
    expect(await conferirCodigoDeLogin(usuario.id, loginId!, codigo, depois)).toEqual({
      ok: false,
      motivo: "expirado",
    });

    // Pela tela: depois de 10 minutos, nem o login pendente vale mais.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(depois);
    expect(await concluirLoginComCodigo(codigo)).toEqual({ ok: false, motivo: "expirado" });
    expect(await sessaoAtual()).toBeNull();
  });

  it("o reenvio espera 60 segundos, troca o código e para no terceiro", async () => {
    const { email } = await novaConta("admin");
    await entrar(email, SENHA);
    const primeiro = ultimoCodigo();
    expect(await reenviarCodigoDoLoginPendente()).toMatchObject({ ok: false, motivo: "espera" });

    vi.useFakeTimers({ toFake: ["Date"] });
    let agora = Date.now();
    for (let i = 0; i < MAXIMO_REENVIOS_CODIGO_LOGIN; i++) {
      agora += 61_000;
      vi.setSystemTime(agora);
      expect(await reenviarCodigoDoLoginPendente()).toEqual({ ok: true });
    }
    expect(codigos()).toHaveLength(1 + MAXIMO_REENVIOS_CODIGO_LOGIN);
    agora += 61_000;
    vi.setSystemTime(agora);
    expect(await reenviarCodigoDoLoginPendente()).toEqual({ ok: false, motivo: "reenvios" });
    expect(codigos()).toHaveLength(1 + MAXIMO_REENVIOS_CODIGO_LOGIN);

    // O primeiro código deixou de valer; o último entra.
    const ultimo = ultimoCodigo();
    if (primeiro !== ultimo) {
      expect(await concluirLoginComCodigo(primeiro)).toMatchObject({
        ok: false,
        motivo: "invalido_email",
      });
    }
    expect(await concluirLoginComCodigo(ultimo)).toMatchObject({ ok: true });
  });

  it("gestor com o app ligado entra com o código do app ou com o do e-mail", async () => {
    const { usuario, email } = await novaConta("admin");
    const segredo = await ligarApp(usuario.id, email);

    await entrar(email, SENHA);
    expect((await loginPendente())?.loginId).toBeTruthy();
    expect(await concluirLoginComCodigo(codigoAtual(segredo))).toMatchObject({ ok: true });
    // O código do e-mail desse login deixa de valer.
    expect(await buscarCodigoDeLogin(usuario.id)).toBeNull();

    em("b");
    await entrar(email, SENHA);
    expect(await concluirLoginComCodigo(ultimoCodigo())).toMatchObject({ ok: true });
    expect((await sessaoAtual())?.usuario.id).toBe(usuario.id);

    // Nenhum dos dois confere: mensagem para os dois.
    em("c");
    await entrar(email, SENHA);
    expect(await concluirLoginComCodigo(errado(ultimoCodigo()))).toEqual({
      ok: false,
      motivo: "invalido_email_ou_app",
    });
  });

  it("gestor que entra pelo Google também passa pelo código por e-mail", async () => {
    const googleId = `g-${randomUUID()}`;
    const { email } = await novaConta("admin", googleId);
    const resultado = await entrarComGoogle({ googleId, email, nome: "Pessoa Teste" }, false);
    expect(resultado).toMatchObject({ ok: true, pedeCodigo: true, envioCodigo: { ok: true } });
    expect(await sessaoAtual()).toBeNull();
    expect(await concluirLoginComCodigo(ultimoCodigo())).toMatchObject({ ok: true });
    expect((await sessaoAtual())?.metodo).toBe("google");
  });

  it("fotógrafo e cliente entram direto com a senha, sem código", async () => {
    for (const papel of ["fotografo", "cliente"] as const) {
      em(papel);
      const { email } = await novaConta(papel);
      expect(await entrar(email, SENHA)).toMatchObject({ pedeCodigo: false });
      expect((await sessaoAtual())?.usuario.email).toBe(email);
    }
    expect(codigos()).toHaveLength(0);
  });
});

describe("produção sem o Resend", () => {
  function producaoSemResend() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_REMETENTE", "");
  }

  it("deixa o gestor entrar só com a senha, avisa no log e não escreve código", async () => {
    // A conta nasce antes: na produção, o banco em memória não sobe (só o já criado continua).
    const { email } = await novaConta("admin");
    producaoSemResend();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(verificacaoPorEmailAtiva()).toBe(false);
    expect(await entrar(email, SENHA)).toMatchObject({ pedeCodigo: false });
    expect((await sessaoAtual())?.usuario.papel).toBe("admin");
    expect(String(aviso.mock.calls[0]?.[0])).toContain("RESEND_API_KEY");
    expect(codigos()).toHaveLength(0);
  });

  it("gestor com o app ligado continua precisando do código do app", async () => {
    const { usuario, email } = await novaConta("admin");
    const segredo = await ligarApp(usuario.id, email);
    producaoSemResend();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await entrar(email, SENHA)).toMatchObject({ pedeCodigo: true, envioCodigo: null });
    expect((await loginPendente())?.loginId).toBeNull();
    expect(await concluirLoginComCodigo(codigoAtual(segredo))).toMatchObject({ ok: true });
  });

  it("com o Resend configurado, a etapa vale também na produção", () => {
    producaoSemResend();
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    vi.stubEnv("EMAIL_REMETENTE", "ClicouAí <nao-responda@teste.com>");
    expect(verificacaoPorEmailAtiva()).toBe(true);
  });
});
