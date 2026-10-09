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

import {
  buscarCodigoEmail,
  buscarContaDoFotografo,
  buscarPedido,
  buscarUsuarioParaLogin,
  criarUsuario,
} from "@/dados";
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";
import { gerarHashSenha } from "@/lib/senha";

import {
  conferirCodigo,
  ESPERA_REENVIO_MS,
  hashDoCodigo,
  iniciarCadastro,
  podeEnviarCodigo,
  reenviarCodigo,
  VALIDADE_CODIGO_MS,
} from "./confirmacao-email";
import { criarPedido } from "./pedidos";
import {
  cadastrar,
  confirmacaoPendente,
  confirmarEmailComCodigo,
  entrar,
  entrarComGoogle,
  sessaoAtual,
} from "./sessao";

const SENHA = "senha-segura-123";

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

function emailNovo() {
  return `cadastro-${randomUUID().slice(0, 8)}@teste.com`;
}

function dadosCadastro(email: string, papel: "cliente" | "fotografo" = "cliente") {
  return { nome: "Pessoa Nova", email, senha: SENHA, papel };
}

/** Um código de 6 dígitos diferente do certo. */
function errado(certo: string) {
  return certo === "000000" ? "111111" : "000000";
}

beforeEach(() => {
  ambiente.potes.clear();
  ambiente.atual = "a";
  ambiente.ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_REMETENTE", "");
  vi.stubEnv("VERCEL_ENV", "");
  log = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cadastro com senha e código por e-mail", () => {
  it("só cria a conta com o código certo; aí abre a sessão e cria o perfil de vendedor", async () => {
    const email = emailNovo();
    expect(await cadastrar(dadosCadastro(email, "fotografo"))).toEqual({ ok: true });
    // Nada de conta nem de sessão antes do código, e o banco não guarda o código.
    expect(await buscarUsuarioParaLogin(email)).toBeNull();
    expect(await sessaoAtual()).toBeNull();
    const codigo = ultimoCodigo();
    expect(codigo).toMatch(/^\d{6}$/);
    const linha = await buscarCodigoEmail(email);
    expect(linha?.codigoHash).toBe(hashDoCodigo(email, codigo));
    expect(JSON.stringify(linha)).not.toContain(codigo);
    expect(JSON.stringify(linha)).not.toContain(SENHA);
    expect((await confirmacaoPendente())?.email).toBe(email);

    const resultado = await confirmarEmailComCodigo(codigo);
    expect(resultado).toMatchObject({ ok: true, novo: true, pedeCodigo: false });
    const sessao = await sessaoAtual();
    expect(sessao?.usuario.email).toBe(email);
    expect(sessao?.usuario.emailConfirmado).toBe(true);
    expect(sessao?.usuario.papel).toBe("fotografo");
    expect(await buscarContaDoFotografo(sessao!.usuario.id)).not.toBeNull();
    // Uso único: o código some e o cookie da confirmação também.
    expect(await buscarCodigoEmail(email)).toBeNull();
    expect(await confirmacaoPendente()).toBeNull();
    expect(await confirmarEmailComCodigo(codigo)).toMatchObject({ ok: false });
  });

  it("código errado conta tentativa; na quinta, nem o certo vale mais, só um código novo", async () => {
    const email = emailNovo();
    await cadastrar(dadosCadastro(email));
    const certo = ultimoCodigo();
    expect(await confirmarEmailComCodigo(errado(certo))).toEqual({
      ok: false,
      motivo: "invalido",
      restantes: 4,
    });
    for (let i = 0; i < 3; i++) await confirmarEmailComCodigo(errado(certo));
    expect(await confirmarEmailComCodigo(errado(certo))).toEqual({
      ok: false,
      motivo: "bloqueado",
    });
    expect(await confirmarEmailComCodigo(certo)).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await buscarUsuarioParaLogin(email)).toBeNull();

    // Depois da espera de 60 s, um código novo zera as tentativas.
    const depois = Date.now() + ESPERA_REENVIO_MS + 1000;
    expect(await reenviarCodigo(email, depois)).toEqual({ ok: true });
    const novo = ultimoCodigo();
    expect(await conferirCodigo(email, certo)).toMatchObject({ ok: false });
    expect(await confirmarEmailComCodigo(novo)).toMatchObject({ ok: true, novo: true });
  });

  it("código vencido (15 minutos) não vale", async () => {
    const email = emailNovo();
    await cadastrar(dadosCadastro(email));
    const codigo = ultimoCodigo();
    expect(await conferirCodigo(email, codigo, Date.now() + VALIDADE_CODIGO_MS + 1000)).toEqual({
      ok: false,
      motivo: "expirado",
    });
    expect(await buscarUsuarioParaLogin(email)).toBeNull();
  });

  it("reenvio espera 60 segundos e tem limite por e-mail", async () => {
    const email = emailNovo();
    await cadastrar(dadosCadastro(email));
    const primeiro = ultimoCodigo();
    const agora = Date.now();
    const espera = await reenviarCodigo(email, agora + 10_000);
    expect(espera).toMatchObject({ ok: false, motivo: "espera" });
    expect(espera.ok === false && espera.motivo === "espera" && espera.segundos).toBeGreaterThan(
      40,
    );
    // Dentro da espera, o código anterior continua valendo e nada novo foi enviado.
    expect(codigos()).toHaveLength(1);

    // 5 envios por hora para o mesmo e-mail (o cadastro foi o primeiro).
    for (let i = 1; i <= 4; i++) {
      expect(await reenviarCodigo(email, agora + i * (ESPERA_REENVIO_MS + 1000))).toEqual({
        ok: true,
      });
    }
    expect(await reenviarCodigo(email, agora + 5 * (ESPERA_REENVIO_MS + 1000))).toEqual({
      ok: false,
      motivo: "limite",
    });
    expect(codigos()).toHaveLength(5);
    expect(codigos()).not.toContain(undefined);
    expect(primeiro).toBeDefined();
  });

  it("dois envios do mesmo cadastro ao mesmo tempo mandam um código só e criam uma conta só", async () => {
    const email = emailNovo();
    const resultados = await Promise.all([
      cadastrar(dadosCadastro(email, "fotografo")),
      cadastrar(dadosCadastro(email, "fotografo")),
      cadastrar(dadosCadastro(email, "fotografo")),
    ]);
    expect(resultados.every((r) => r.ok)).toBe(true);
    expect(codigos()).toHaveLength(1);
    const codigo = ultimoCodigo();
    const confirmacoes = await Promise.all([
      conferirCodigo(email, codigo),
      conferirCodigo(email, codigo),
    ]);
    expect(confirmacoes.filter((c) => c.ok)).toHaveLength(1);
  });

  it("refazer o cadastro (abandonado) troca os dados e não prende o e-mail", async () => {
    const email = emailNovo();
    await cadastrar({ ...dadosCadastro(email), nome: "Nome Antigo", senha: "senha-antiga-1" });
    // Depois da espera, o cadastro refeito manda outro código; o antigo deixa de valer.
    const antigo = ultimoCodigo();
    expect(
      await iniciarCadastro(
        { ...dadosCadastro(email), nome: "Nome Novo" },
        Date.now() + ESPERA_REENVIO_MS + 1000,
      ),
    ).toEqual({ ok: true });
    const novo = ultimoCodigo();
    expect(novo).not.toBeUndefined();
    if (novo !== antigo) {
      expect(await conferirCodigo(email, antigo)).toMatchObject({ ok: false, motivo: "invalido" });
    }
    const confirmado = await conferirCodigo(email, novo);
    expect(confirmado).toMatchObject({ ok: true, usuario: { nome: "Nome Novo" } });
    expect(await entrar(email, SENHA)).toMatchObject({ pedeCodigo: false });
  });

  it("e-mail que já tem conta (com maiúsculas também) não começa outro cadastro", async () => {
    const email = emailNovo();
    await cadastrar(dadosCadastro(email));
    await confirmarEmailComCodigo(ultimoCodigo());
    expect(await cadastrar(dadosCadastro(email.toUpperCase()))).toEqual({
      ok: false,
      motivo: "email_em_uso",
    });
  });

  it("liga ao confirmar as compras feitas antes como convidado com o mesmo e-mail", async () => {
    const email = emailNovo();
    const [lia] = fotografos;
    const evento = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
    const foto = fotos.find(
      (f) =>
        f.eventoId === evento.id &&
        f.enviadaPor === lia.id &&
        f.status === "pronta" &&
        f.excluidaEm === null,
    )!;
    const pedido = await criarPedido([foto.id], {
      clienteId: null,
      nome: "Convidada",
      email: email.toUpperCase(),
      whatsapp: "11999990000",
      aceitaWhatsapp: false,
      metodo: "pix",
    });
    if (!pedido.ok) throw new Error(pedido.motivo);

    await cadastrar(dadosCadastro(email));
    // Antes do código, nada é ligado (quem cadastrou pode não ser a dona do e-mail).
    expect((await buscarPedido(pedido.pedidoId))?.pedido.clienteId).toBeNull();
    const resultado = await confirmarEmailComCodigo(ultimoCodigo());
    expect(resultado).toMatchObject({ ok: true, vinculados: 1 });
    const usuario = await buscarUsuarioParaLogin(email);
    expect((await buscarPedido(pedido.pedidoId))?.pedido.clienteId).toBe(usuario?.id);
  });
});

describe("login de conta não confirmada", () => {
  it("cadastro pendente: com a senha certa, volta para a tela do código; sem ela, nada revela", async () => {
    const email = emailNovo();
    await cadastrar(dadosCadastro(email));
    ambiente.atual = "b";
    expect(await entrar(email, "senha-errada-1")).toBeNull();
    expect(await entrar(emailNovo(), SENHA)).toBeNull();
    expect(await confirmacaoPendente()).toBeNull();

    const resultado = await entrar(email, SENHA);
    expect(resultado).toMatchObject({ pedeConfirmacao: true, pedeCodigo: false });
    expect(await sessaoAtual()).toBeNull();
    // Dentro dos 60 s, não manda outro: o código do cadastro continua valendo.
    expect(codigos()).toHaveLength(1);
    expect((await confirmacaoPendente())?.email).toBe(email);
    expect(await confirmarEmailComCodigo(ultimoCodigo())).toMatchObject({ ok: true });
    expect((await sessaoAtual())?.usuario.email).toBe(email);
  });

  it("conta antiga sem confirmação: a senha certa manda o código e só ele abre a sessão", async () => {
    const email = emailNovo();
    const usuario = await criarUsuario({
      nome: "Conta Antiga",
      email,
      senhaHash: gerarHashSenha(SENHA),
      papel: "cliente",
    });
    expect(await entrar(email, "senha-errada-1")).toBeNull();
    expect(codigos()).toHaveLength(0);

    expect(await entrar(email, SENHA)).toMatchObject({ pedeConfirmacao: true });
    expect(codigos()).toHaveLength(1);
    expect(await sessaoAtual()).toBeNull();
    const resultado = await confirmarEmailComCodigo(ultimoCodigo());
    expect(resultado).toMatchObject({ ok: true, novo: false, usuario: { id: usuario.id } });
    expect((await sessaoAtual())?.usuario.emailConfirmado).toBe(true);
    // Daí em diante, entra direto.
    ambiente.atual = "b";
    expect(await entrar(email, SENHA)).toMatchObject({ pedeCodigo: false, usuario: { email } });
    expect(codigos()).toHaveLength(1);
  });
});

describe("login com o Google", () => {
  it("não pede código e descarta um cadastro com senha que esperava o código", async () => {
    const email = emailNovo();
    await cadastrar(dadosCadastro(email));
    ambiente.atual = "b";
    const resultado = await entrarComGoogle(
      { googleId: `google-${randomUUID()}`, email, nome: "Pessoa Google" },
      false,
    );
    expect(resultado).toMatchObject({ ok: true, novo: true, pedeCodigo: false });
    expect((await sessaoAtual())?.usuario.emailConfirmado).toBe(true);
    expect(codigos()).toHaveLength(1);
    expect(await buscarCodigoEmail(email)).toBeNull();

    // O código do cadastro com senha já não cria outra conta.
    ambiente.atual = "a";
    expect(await confirmarEmailComCodigo(ultimoCodigo())).toMatchObject({ ok: false });
  });
});

describe("sem o Resend", () => {
  it("na produção, o cadastro falha com aviso claro e não libera conta nem escreve o código", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(podeEnviarCodigo()).toBe(false);
    const email = emailNovo();
    expect(await cadastrar(dadosCadastro(email))).toEqual({ ok: false, motivo: "indisponivel" });
    expect(await buscarCodigoEmail(email)).toBeNull();
    expect(await buscarUsuarioParaLogin(email)).toBeNull();
    expect(codigos()).toHaveLength(0);
    expect(erro).not.toHaveBeenCalledWith(expect.stringMatching(/\d{6}/));
  });

  it("na produção com o Resend, o código vai só no e-mail, nunca no log", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    vi.stubEnv("EMAIL_REMETENTE", "ClicouAí <nao-responda@clicouai.com>");
    const corpos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        corpos.push(String(init.body));
        return new Response("{}", { status: 200 });
      }),
    );
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const email = emailNovo();
    expect(await cadastrar(dadosCadastro(email))).toEqual({ ok: true });
    expect(corpos).toHaveLength(1);
    const codigo = /\b(\d{6})\b/.exec(JSON.parse(corpos[0]).text)?.[1];
    expect(codigo).toMatch(/^\d{6}$/);
    const tudo = JSON.stringify([...log.mock.calls, ...erro.mock.calls]);
    expect(tudo).not.toContain(codigo);
    vi.unstubAllGlobals();
  });

  it("fora da produção, o código aparece no log local para testar", () => {
    for (const valor of ["", "preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", valor);
      expect(podeEnviarCodigo()).toBe(true);
    }
  });
});
