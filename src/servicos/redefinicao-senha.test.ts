import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `after()` roda o trabalho depois da resposta; aqui ele fica guardado e o teste o executa.
const tarefas = vi.hoisted(() => [] as (() => Promise<void> | void)[]);
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
  after: (tarefa: () => Promise<void> | void) => void tarefas.push(tarefa),
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

import { esqueciSenhaAcao } from "@/app/(cliente)/entrar/acoes";
import { buscarUsuario, criarUsuario, listarMensagens } from "@/dados";
import { gerarHashSenha } from "@/lib/senha";

import { excluirConta } from "./exclusao-conta";
import {
  pedirRedefinicaoDeSenha,
  redefinirSenha,
  VALIDADE_REDEFINICAO_MS,
} from "./redefinicao-senha";
import { entrar, sessaoAtual } from "./sessao";

const SENHA = "senha-antiga-123";
const NOVA = "senha-nova-456";

let log: ReturnType<typeof vi.spyOn>;
/** Tokens dos links que o modo de desenvolvimento escreveu no log (sem o Resend). */
function tokens(): string[] {
  return log.mock.calls
    .map((args: unknown[]) => /#token=([\w-]+)/.exec(String(args[0]))?.[1])
    .filter((t: string | undefined): t is string => Boolean(t));
}

async function contaComSenha(confirmada = true) {
  const email = `senha-${randomUUID().slice(0, 8)}@teste.com`;
  const usuario = await criarUsuario({
    nome: "Pessoa Esquecida",
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel: "cliente",
    emailConfirmado: confirmada,
  });
  return { usuario, email };
}

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

beforeEach(() => {
  ambiente.potes.clear();
  ambiente.atual = "a";
  ambiente.ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
  tarefas.length = 0;
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_REMETENTE", "");
  vi.stubEnv("VERCEL_ENV", "");
  log = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("esqueci a senha", () => {
  it("conta existente: o link troca a senha uma vez só e derruba todas as sessões", async () => {
    const { usuario, email } = await contaComSenha();
    ambiente.atual = "celular";
    await entrar(email, SENHA);
    ambiente.atual = "a";
    await entrar(email, SENHA);
    expect((await sessaoAtual())?.usuario.id).toBe(usuario.id);

    // Dois pedidos: dois links válidos até a senha mudar.
    expect(await pedirRedefinicaoDeSenha(email)).toBe("link");
    expect(await pedirRedefinicaoDeSenha(email)).toBe("link");
    const [primeiro, segundo] = tokens();
    expect(primeiro).toMatch(/^[\w-]{43}$/);

    expect(await redefinirSenha(segundo, NOVA)).toEqual({ ok: true, email });
    // Todas as sessões caíram, neste e no outro aparelho.
    expect(await sessaoAtual()).toBeNull();
    ambiente.atual = "celular";
    expect(await sessaoAtual()).toBeNull();
    // Senha antiga não entra; a nova sim.
    expect(await entrar(email, SENHA)).toBeNull();
    expect(await entrar(email, NOVA)).toMatchObject({ usuario: { id: usuario.id } });

    // O mesmo link não vale de novo, e o outro link pendente também caiu.
    expect(await redefinirSenha(segundo, "outra-senha-789")).toEqual({
      ok: false,
      motivo: "invalido",
    });
    expect(await redefinirSenha(primeiro, "outra-senha-789")).toEqual({
      ok: false,
      motivo: "invalido",
    });

    // Aviso de segurança na caixa de saída, sem o token nem a senha.
    const avisos = (await listarMensagens()).filter(
      (m) => m.para === email && m.tipo === "seguranca",
    );
    expect(avisos.map((m) => m.assunto)).toContain(
      "A senha da sua conta no ClicouAí foi redefinida",
    );
    const caixa = JSON.stringify(await listarMensagens());
    expect(caixa).not.toContain(primeiro);
    expect(caixa).not.toContain(segundo);
    expect(caixa).not.toContain(NOVA);
  });

  it("link vencido (30 minutos) não troca a senha", async () => {
    const { email } = await contaComSenha();
    await pedirRedefinicaoDeSenha(email);
    const [token] = tokens();
    expect(await redefinirSenha(token, NOVA, Date.now() + VALIDADE_REDEFINICAO_MS + 1000)).toEqual({
      ok: false,
      motivo: "invalido",
    });
    expect(await entrar(email, SENHA)).not.toBeNull();
  });

  it("e-mail sem conta, conta excluída e token inventado: nada é enviado nem trocado", async () => {
    expect(await pedirRedefinicaoDeSenha(`ninguem-${randomUUID()}@teste.com`)).toBe("nada");
    const { usuario, email } = await contaComSenha();
    expect(await excluirConta(usuario, { senha: SENHA })).toMatchObject({ ok: true });
    expect(await pedirRedefinicaoDeSenha(email)).toBe("nada");
    expect(tokens()).toHaveLength(0);
    expect(await redefinirSenha("x".repeat(43), NOVA)).toEqual({ ok: false, motivo: "invalido" });
  });

  it("conta só com o Google: o e-mail explica que ela entra com o Google, sem link", async () => {
    const email = `google-${randomUUID().slice(0, 8)}@teste.com`;
    await criarUsuario({
      nome: "Só Google",
      email,
      senhaHash: null,
      papel: "cliente",
      googleId: `google-${randomUUID()}`,
      emailConfirmado: true,
    });
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
    expect(await pedirRedefinicaoDeSenha(email)).toBe("so_google");
    expect(corpos).toHaveLength(1);
    expect(JSON.parse(corpos[0]).subject).toBe("Sua conta do ClicouAí entra com o Google");
    expect(corpos[0]).not.toContain("#token=");
  });

  it("a tela responde igual exista a conta ou não, e o envio fica para depois da resposta", async () => {
    const { email } = await contaComSenha();
    const existe = await esqueciSenhaAcao({}, formulario({ email }));
    const naoExiste = await esqueciSenhaAcao(
      {},
      formulario({ email: `ninguem-${randomUUID().slice(0, 8)}@teste.com` }),
    );
    expect(existe).toEqual({ enviado: true, email });
    expect(naoExiste).toMatchObject({ enviado: true });
    // Nada foi enviado antes da resposta.
    expect(tokens()).toHaveLength(0);
    for (const tarefa of tarefas) await tarefa();
    expect(tokens()).toHaveLength(1);
  });

  it("limite por e-mail: depois de 3 pedidos na hora, a tela pede para esperar", async () => {
    const email = `limite-${randomUUID().slice(0, 8)}@teste.com`;
    for (let i = 0; i < 3; i++) {
      expect(await esqueciSenhaAcao({}, formulario({ email }))).toMatchObject({ enviado: true });
    }
    expect(await esqueciSenhaAcao({}, formulario({ email }))).toMatchObject({
      erro: expect.stringMatching(/Espere/),
    });
  });

  it("conta antiga não confirmada: redefinir pelo link do e-mail também confirma o e-mail", async () => {
    const { usuario, email } = await contaComSenha(false);
    await pedirRedefinicaoDeSenha(email);
    const [token] = tokens();
    expect(await redefinirSenha(token, NOVA)).toMatchObject({ ok: true });
    expect((await buscarUsuario(usuario.id))?.emailConfirmado).toBe(true);
    expect(await entrar(email, NOVA)).toMatchObject({ pedeCodigo: false, usuario: { email } });
  });

  it("na produção com o Resend, o token vai só no e-mail, nunca no log", async () => {
    const { email } = await contaComSenha();
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
    expect(await pedirRedefinicaoDeSenha(email)).toBe("link");
    const token = /#token=([\w-]+)/.exec(JSON.parse(corpos[0]).text)?.[1];
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify([...log.mock.calls, ...erro.mock.calls])).not.toContain(token);
  });
});
