import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` e `after()` só existem dentro de uma requisição do Next.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
  after: () => {},
}));

// Fora do Next, a revalidação não faz nada.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// Um pote de cookies por teste (a sessão), saindo de um IP próprio (limites por IP).
const ambiente = vi.hoisted(() => ({ pote: new Map<string, string>(), ip: "203.0.113.9" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) =>
      ambiente.pote.has(nome) ? { name: nome, value: ambiente.pote.get(nome)! } : undefined,
    set: (nome: string, valor: string) => ambiente.pote.set(nome, valor),
    delete: (nome: string) => ambiente.pote.delete(nome),
  }),
  headers: async () => new Headers({ "x-forwarded-for": ambiente.ip }),
}));

// O banco de verdade (PGlite), com a chance de simular uma falha na leitura.
vi.mock("@/db", async (original) => {
  const real = await original<typeof import("@/db")>();
  return { ...real, obterBanco: vi.fn(real.obterBanco) };
});

import { alternarManutencaoAcao } from "@/app/(admin)/admin/manutencao-acoes";
import { finalizarCompra } from "@/app/(cliente)/checkout/acoes";
import {
  criarUsuario,
  esquecerManutencao,
  situacaoDaManutencao,
  type Papel,
  type Usuario,
  VALIDADE_CACHE_MANUTENCAO_MS,
} from "@/dados";
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";
import { obterBanco, schema } from "@/db";
import { MENSAGEM_MANUTENCAO } from "@/lib/manutencao";
import { gerarHashSenha } from "@/lib/senha";

import {
  alternarManutencao,
  emManutencaoParaEste,
  recusarSeEmManutencao,
  respostaDaManutencao,
  respostaDaManutencaoPara,
} from "./manutencao";
import { concluirLoginComCodigo, entrar } from "./sessao";

const SENHA = "senha-de-teste-123";

async function conta(papel: Papel, nome = "Conta Teste"): Promise<Usuario & { email: string }> {
  const email = `manutencao-${randomUUID().slice(0, 8)}@teste.com`;
  const usuario = await criarUsuario({
    nome,
    email,
    senhaHash: gerarHashSenha(SENHA),
    papel,
    emailConfirmado: true,
  });
  return { ...usuario, email };
}

/** Abre a sessão da conta no pote de cookies (cliente e fotógrafo entram só com a senha). */
async function logar(usuario: { email: string }) {
  const resultado = await entrar(usuario.email, SENHA);
  expect(resultado && "pedeCodigo" in resultado && !resultado.pedeCodigo).toBe(true);
}

async function ligar(ativa: boolean, mensagem: string | null = null) {
  const gestor = await conta("admin", "Gestora Plantão");
  const resultado = await alternarManutencao(gestor, { ativa, mensagem });
  expect(resultado).toMatchObject({ ok: true });
  return gestor;
}

const [lia] = fotografos;
const evento = eventos.find(
  (e) =>
    e.fotografoId === lia.id &&
    e.status === "publicado" &&
    e.slug === "corrida-ibirapuera-10k-2026",
)!;
const foto = fotos.find(
  (f) =>
    f.eventoId === evento.id &&
    f.enviadaPor === lia.id &&
    f.status === "pronta" &&
    f.excluidaEm === null &&
    f.precoCentavos === null,
)!;

function compra() {
  return finalizarCompra({
    ids: [foto.id],
    nome: "Cliente Teste",
    email: "cliente-manutencao@teste.com",
    whatsapp: "",
    aceitaWhatsapp: false,
    metodo: "pix",
    opcoes: {},
  });
}

// O primeiro acesso sobe o PGlite, migra e semeia: pode passar do tempo de um beforeEach.
beforeAll(async () => {
  await obterBanco();
}, 60_000);

beforeEach(async () => {
  ambiente.pote.clear();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_REMETENTE", "");
  vi.stubEnv("VERCEL_ENV", "");
  ambiente.ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  vi.spyOn(console, "info").mockImplementation(() => {});
  // Cada teste começa com a manutenção desligada.
  await ligar(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ligar e desligar", () => {
  it("grava o estado, a mensagem, quem e quando", async () => {
    const antes = Date.now();
    const gestor = await ligar(true, "  Voltamos às 15h.  ");
    const situacao = await situacaoDaManutencao();
    expect(situacao.ativa).toBe(true);
    expect(situacao.mensagem).toBe("Voltamos às 15h.");
    expect(situacao.por).toBe(gestor.nome);
    expect(new Date(situacao.desde!).getTime()).toBeGreaterThanOrEqual(antes - 1000);

    const outro = await conta("admin", "Gestor Fecha");
    expect(await alternarManutencao(outro, { ativa: false, mensagem: "ignorada" })).toMatchObject({
      ok: true,
      situacao: { ativa: false, mensagem: null, por: "Gestor Fecha" },
    });
    expect((await situacaoDaManutencao()).ativa).toBe(false);
  });

  it("mensagem vazia vira nula e mensagem longa é recusada", async () => {
    await ligar(true, "   ");
    expect((await situacaoDaManutencao()).mensagem).toBeNull();
    const gestor = await conta("admin");
    expect(await alternarManutencao(gestor, { ativa: true, mensagem: "x".repeat(201) })).toEqual({
      erro: "A mensagem pode ter até 200 caracteres.",
    });
    expect(await alternarManutencao(gestor, { ativa: "sim" })).toHaveProperty("erro");
  });

  it.each<Papel>(["fotografo", "cliente"])("conta %s não liga a manutenção", async (papel) => {
    const usuario = await conta(papel);
    expect(await alternarManutencao(usuario, { ativa: true })).toEqual({
      erro: "Só gestores ligam ou desligam a manutenção.",
    });
    expect((await situacaoDaManutencao()).ativa).toBe(false);
  });

  it.each<Papel>(["fotografo", "cliente"])(
    "a ação da gestão manda a conta %s embora sem mudar nada",
    async (papel) => {
      await logar(await conta(papel));
      await expect(alternarManutencaoAcao({ ativa: true })).rejects.toThrow("NEXT_REDIRECT");
      expect((await situacaoDaManutencao()).ativa).toBe(false);
    },
  );

  it("a ação da gestão manda o visitante para o login", async () => {
    await expect(alternarManutencaoAcao({ ativa: true })).rejects.toThrow("NEXT_REDIRECT");
    expect((await situacaoDaManutencao()).ativa).toBe(false);
  });
});

describe("quem fica de fora", () => {
  it("com a manutenção ligada, só o gestor passa", async () => {
    await ligar(true);
    expect(await emManutencaoParaEste(null)).toBe(true);
    expect(await emManutencaoParaEste({ papel: "cliente" })).toBe(true);
    expect(await emManutencaoParaEste({ papel: "fotografo" })).toBe(true);
    expect(await emManutencaoParaEste({ papel: "admin" })).toBe(false);
  });

  it("com a manutenção desligada, ninguém fica de fora", async () => {
    for (const usuario of [null, { papel: "cliente" as const }, { papel: "fotografo" as const }]) {
      expect(await emManutencaoParaEste(usuario)).toBe(false);
    }
  });

  it("lê da memória: a mudança gravada por outra instância chega quando o cache vence", async () => {
    await ligar(true);
    // Outra instância desliga direto no banco: esta continua com o que lembrou.
    const banco = await obterBanco();
    await banco.insert(schema.modoManutencao).values({ ativa: false });
    expect((await situacaoDaManutencao()).ativa).toBe(true);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + VALIDADE_CACHE_MANUTENCAO_MS + 1);
    expect((await situacaoDaManutencao()).ativa).toBe(false);
  });

  it("se o banco falha na leitura, considera desligada e registra no log", async () => {
    await ligar(true);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    // Sem o estado na memória, a leitura vai ao banco, que falha uma vez.
    esquecerManutencao();
    vi.mocked(obterBanco).mockRejectedValueOnce(new Error("banco fora do ar"));
    expect(await situacaoDaManutencao()).toEqual({
      ativa: false,
      mensagem: null,
      desde: null,
      por: null,
    });
    expect(erro).toHaveBeenCalledWith(
      expect.stringContaining("[manutencao] falha ao ler o estado"),
      expect.any(Error),
    );
    // Na leitura seguinte, com o banco de volta, o estado real.
    expect((await situacaoDaManutencao()).ativa).toBe(true);
  });
});

describe("ações e rotas do público", () => {
  it("o pedido do cliente é recusado com a manutenção ligada e aceito sem ela", async () => {
    await logar(await conta("cliente"));
    await ligar(true);
    expect(await compra()).toEqual({ ok: false, erros: {}, mensagem: MENSAGEM_MANUTENCAO });

    await ligar(false);
    const resultado = await compra();
    expect(resultado.ok).toBe(true);
  });

  it("o visitante também não compra com a manutenção ligada", async () => {
    await ligar(true);
    expect(await compra()).toEqual({ ok: false, erros: {}, mensagem: MENSAGEM_MANUTENCAO });
  });

  it("recusarSeEmManutencao barra visitante e fotógrafo e deixa o gestor logado passar", async () => {
    await ligar(true);
    expect(await recusarSeEmManutencao()).toBe(MENSAGEM_MANUTENCAO);
    await logar(await conta("fotografo"));
    expect(await recusarSeEmManutencao()).toBe(MENSAGEM_MANUTENCAO);

    // O gestor entra com o código por e-mail (fora da produção, o código vai para o log).
    ambiente.pote.clear();
    const log = vi.mocked(console.info);
    const gestor = await conta("admin");
    expect(await entrar(gestor.email, SENHA)).toMatchObject({ pedeCodigo: true });
    const codigo = log.mock.calls
      .map((args) => /código (\d{6})/.exec(String(args[0]))?.[1])
      .filter(Boolean)
      .at(-1)!;
    expect(await concluirLoginComCodigo(codigo)).toMatchObject({ ok: true });
    expect(await recusarSeEmManutencao()).toBeNull();
  });

  it("plugin do Lightroom: só a chave de um gestor passa", async () => {
    await ligar(true);
    expect((await respostaDaManutencaoPara({ papel: "fotografo" }))?.status).toBe(503);
    expect(await respostaDaManutencaoPara({ papel: "admin" })).toBeNull();
    await ligar(false);
    expect(await respostaDaManutencaoPara({ papel: "fotografo" })).toBeNull();
  });

  it("rota fechada responde 503 com Retry-After; webhook e jobs seguem abertos", async () => {
    await ligar(true);
    const fechada = await respostaDaManutencao(
      new Request("http://localhost/api/busca-facial", { method: "POST" }),
    );
    expect(fechada?.status).toBe(503);
    expect(fechada?.headers.get("Retry-After")).toBe("300");
    expect(await fechada?.json()).toEqual({ erro: MENSAGEM_MANUTENCAO });

    for (const aberta of ["/api/webhooks/mercadopago", "/api/jobs/pedidos", "/api/auth/google"]) {
      expect(await respostaDaManutencao(new Request(`http://localhost${aberta}`))).toBeNull();
    }
    await ligar(false);
    expect(await respostaDaManutencao(new Request("http://localhost/api/busca-facial"))).toBeNull();
  });
});
