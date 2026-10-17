import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fora de uma requisição do Next: cookies de mentira (com o caminho, para conferir o apagar).
const pote = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.77" }),
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome) } : undefined),
    set: (nome: string, valor: string) => void pote.set(nome, valor),
    delete: (arg: string | { name: string }) =>
      void pote.delete(typeof arg === "string" ? arg : arg.name),
  }),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// O gestor logado é escolhido pelo teste; sem gestor, exigirGestor "redireciona" (lança).
const sessao = vi.hoisted(() => ({ usuarioId: "" as string, papel: "admin" as string }));
vi.mock("@/servicos/sessao", () => ({
  exigirGestor: async () => {
    if (!sessao.usuarioId || sessao.papel !== "admin") throw new Error("NEXT_REDIRECT");
    return { id: sessao.usuarioId, papel: "admin" };
  },
  // A manutenção (desligada nos testes) pode pedir quem está logado.
  usuarioAtual: async () =>
    sessao.usuarioId ? { id: sessao.usuarioId, papel: sessao.papel } : null,
}));

import {
  alternarArmazenamentoExperimentalAcao,
  desconectarDriveAcao,
  marcarEventoHibridoAcao,
  testarConexaoDriveAcao,
  voltarEventoParaR2Acao,
} from "@/app/(admin)/admin/armazenamento/acoes";
import { GET as iniciarRota } from "@/app/api/admin/armazenamento/google/route";
import { GET as callbackRota } from "@/app/api/admin/armazenamento/google/callback/route";
import {
  armazenamentoExperimentalAtivo,
  eventosHibridos,
  FINALIDADE_REFRESH_TOKEN_DRIVE,
  lerCredencialDrive,
  situacaoDaConexaoDrive,
} from "@/dados/configuracoes";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { reiniciarArmazenamento } from "@/lib/armazenamento";
import { decifrarSegredo } from "@/lib/segredo-cifrado";

import { COOKIE_DRIVE, iniciarConexaoDrive } from "./conexao-drive";

const gestorId = fotografos[0].usuarioId;
const evento = eventos.find((e) => e.slug === "meia-maratona-rio-2026")!;
const BASE = "https://clicouai.test";
const REFRESH = "1//refresh-de-teste";

// ---------------------------------------------------------------- Google falso

const google = vi.hoisted(() => ({
  chamadas: [] as string[],
  escopo: "https://www.googleapis.com/auth/drive.file",
  revogados: [] as string[],
}));

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function googleFalso(entrada: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(entrada));
  google.chamadas.push(`${init?.method ?? "GET"} ${url.origin}${url.pathname}`);
  if (url.href.startsWith("https://oauth2.googleapis.com/token")) {
    const corpo = new URLSearchParams(String(init?.body));
    if (corpo.get("grant_type") === "authorization_code" && corpo.get("code") !== "codigo-bom") {
      return json({ error: "invalid_grant" }, 400);
    }
    return json({
      access_token: "ya29.acesso",
      expires_in: 3600,
      refresh_token: REFRESH,
      scope: google.escopo,
    });
  }
  if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) {
    google.revogados.push(new URLSearchParams(String(init?.body)).get("token") ?? "");
    return new Response(null, { status: 200 });
  }
  if (url.pathname === "/drive/v3/about") {
    const campos = url.searchParams.get("fields") ?? "";
    if (campos.includes("storageQuota")) {
      return json({
        storageQuota: {
          usage: String(3 * 1024 ** 3),
          limit: String(15 * 1024 ** 3),
          usageInDrive: "10",
        },
        user: { emailAddress: "dono.da.conta@gmail.com" },
      });
    }
    return json({ user: { emailAddress: "dono.da.conta@gmail.com" } });
  }
  if (url.pathname === "/drive/v3/files" && (init?.method ?? "GET") === "GET") {
    return json({ files: [] });
  }
  if (url.pathname === "/drive/v3/files" && init?.method === "POST") {
    return json({ id: "pasta-raiz-id" });
  }
  if (url.pathname.startsWith("/drive/v3/files/")) {
    return json({ id: "pasta-raiz-id", name: "ClicouAI_Storage", trashed: false });
  }
  return json({ error: { message: "rota não simulada" } }, 500);
}

function pedido(caminho: string) {
  // NextRequest com nextUrl, como o Next entrega à rota.
  return new NextRequest(new URL(caminho, BASE));
}

beforeEach(async () => {
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "drive-client-id");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "drive-client-secret");
  vi.stubEnv("APP_URL", `${BASE}/`);
  vi.stubGlobal("fetch", vi.fn(googleFalso));
  sessao.usuarioId = gestorId;
  sessao.papel = "admin";
  pote.clear();
  google.chamadas = [];
  google.revogados = [];
  google.escopo = "https://www.googleapis.com/auth/drive.file";
  reiniciarArmazenamento();
  const banco = await obterBanco();
  await banco.delete(t.credenciaisGoogleDrive);
  await banco.delete(t.configuracoes);
  await banco
    .update(t.eventos)
    .set({ armazenamentoOriginais: "r2" })
    .where(eq(t.eventos.id, evento.id));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function conectar() {
  const { state } = iniciarConexaoDrive(gestorId);
  pote.set(COOKIE_DRIVE, state);
  return callbackRota(
    pedido(`/api/admin/armazenamento/google/callback?code=codigo-bom&state=${state}`),
  );
}

// ---------------------------------------------------------------- Rotas do OAuth

describe("início da conexão com o Google Drive", () => {
  it("exige gestor", async () => {
    sessao.papel = "fotografo";
    await expect(iniciarRota(pedido("/api/admin/armazenamento/google"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    sessao.usuarioId = "";
    await expect(iniciarRota(pedido("/api/admin/armazenamento/google"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(pote.size).toBe(0);
  });

  it("sem as variáveis do Drive, volta à tela com erro e não grava cookie", async () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "");
    const resposta = await iniciarRota(pedido("/api/admin/armazenamento/google"));
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get("location")).toBe(
      `${BASE}/admin/armazenamento?erro=nao_configurado`,
    );
    expect(pote.has(COOKIE_DRIVE)).toBe(false);
  });

  it("grava o state no cookie e manda ao consentimento do Google com o APP_URL", async () => {
    const resposta = await iniciarRota(pedido("/api/admin/armazenamento/google"));
    expect(resposta.status).toBe(303);
    const destino = new URL(resposta.headers.get("location")!);
    expect(destino.origin + destino.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(destino.searchParams.get("redirect_uri")).toBe(
      `${BASE}/api/admin/armazenamento/google/callback`,
    );
    expect(destino.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(destino.searchParams.get("state")).toBe(pote.get(COOKIE_DRIVE));
    expect(google.chamadas).toEqual([]);
  });
});

describe("volta do Google (callback)", () => {
  it("rejeita state que não confere com o cookie, adulterado ou de outro gestor", async () => {
    const { state } = iniciarConexaoDrive(gestorId);
    const casos: [string | null, string][] = [
      [null, state],
      ["outro-state-qualquer-com-mais-de-20", state],
      [state, `${state}x`],
    ];
    for (const [cookie, naUrl] of casos) {
      pote.clear();
      if (cookie) pote.set(COOKIE_DRIVE, cookie);
      const resposta = await callbackRota(
        pedido(`/api/admin/armazenamento/google/callback?code=codigo-bom&state=${naUrl}`),
      );
      expect(resposta.headers.get("location")).toBe(`${BASE}/admin/armazenamento?erro=state`);
    }

    // State certo, mas começado por outro gestor.
    const deOutro = iniciarConexaoDrive(fotografos[1].usuarioId).state;
    pote.set(COOKIE_DRIVE, deOutro);
    const resposta = await callbackRota(
      pedido(`/api/admin/armazenamento/google/callback?code=codigo-bom&state=${deOutro}`),
    );
    expect(resposta.headers.get("location")).toBe(`${BASE}/admin/armazenamento?erro=state`);

    expect(google.chamadas).toEqual([]);
    expect(await lerCredencialDrive()).toBeNull();
  });

  it("o cookie é de uso único", async () => {
    const { state } = iniciarConexaoDrive(gestorId);
    pote.set(COOKIE_DRIVE, state);
    await callbackRota(
      pedido(`/api/admin/armazenamento/google/callback?error=access_denied&state=${state}`),
    );
    expect(pote.has(COOKIE_DRIVE)).toBe(false);
  });

  it("grava a credencial cifrada, cria a pasta raiz e volta à tela", async () => {
    const erro = vi.spyOn(console, "error");
    const resposta = await conectar();
    expect(resposta.status).toBe(303);
    expect(resposta.headers.get("location")).toBe(`${BASE}/admin/armazenamento?ok=conectado`);

    const credencial = await lerCredencialDrive();
    expect(credencial).toMatchObject({
      contaEmail: "dono.da.conta@gmail.com",
      pastaRaizId: "pasta-raiz-id",
      conectadoPor: gestorId,
    });
    // Cifrado no banco: o token em claro não aparece, mas a cifra abre de volta.
    expect(credencial!.refreshTokenCifrado).not.toContain(REFRESH);
    expect(decifrarSegredo(credencial!.refreshTokenCifrado, FINALIDADE_REFRESH_TOKEN_DRIVE)).toBe(
      REFRESH,
    );
    expect(pote.has(COOKIE_DRIVE)).toBe(false);
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });

  it("código recusado pelo Google volta com erro curto, sem detalhes", async () => {
    const { state } = iniciarConexaoDrive(gestorId);
    pote.set(COOKIE_DRIVE, state);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const resposta = await callbackRota(
      pedido(`/api/admin/armazenamento/google/callback?code=codigo-ruim&state=${state}`),
    );
    expect(resposta.headers.get("location")).toBe(`${BASE}/admin/armazenamento?erro=token`);
    expect(await lerCredencialDrive()).toBeNull();
    // O log não leva o código nem tokens.
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/codigo-ruim|ya29|1\/\//);
    log.mockRestore();
  });

  it("sem o escopo drive.file concedido, revoga e volta com sem_permissao", async () => {
    google.escopo = "openid";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const resposta = await conectar();
    expect(resposta.headers.get("location")).toBe(`${BASE}/admin/armazenamento?erro=sem_permissao`);
    expect(google.revogados).toEqual([REFRESH]);
    expect(await lerCredencialDrive()).toBeNull();
    log.mockRestore();
  });
});

// ---------------------------------------------------------------- Ações da tela

describe("ações da tela de Armazenamento", () => {
  it("todas exigem gestor", async () => {
    sessao.papel = "cliente";
    await expect(testarConexaoDriveAcao()).rejects.toThrow("NEXT_REDIRECT");
    await expect(desconectarDriveAcao()).rejects.toThrow("NEXT_REDIRECT");
    await expect(alternarArmazenamentoExperimentalAcao(true)).rejects.toThrow("NEXT_REDIRECT");
    await expect(marcarEventoHibridoAcao({}, new FormData())).rejects.toThrow("NEXT_REDIRECT");
    await expect(voltarEventoParaR2Acao(evento.id)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("liga e desliga o armazenamento experimental (ligar exige conta conectada)", async () => {
    expect(await alternarArmazenamentoExperimentalAcao(true)).toEqual({
      erro: "Conecte uma conta do Google Drive antes de ativar.",
    });
    expect(await armazenamentoExperimentalAtivo()).toBe(false);

    await conectar();
    expect((await alternarArmazenamentoExperimentalAcao(true)).ok).toBeTruthy();
    expect(await armazenamentoExperimentalAtivo()).toBe(true);
    expect((await alternarArmazenamentoExperimentalAcao(false)).ok).toBeTruthy();
    expect(await armazenamentoExperimentalAtivo()).toBe(false);
  });

  it("marca evento híbrido pelo endereço e volta ao R2", async () => {
    const formulario = new FormData();
    formulario.set("slug", "  Nao-Existe-Mesmo ");
    expect((await marcarEventoHibridoAcao({}, formulario)).erro).toBe(
      "Nenhum evento com esse endereço.",
    );
    formulario.set("slug", "<script>");
    expect((await marcarEventoHibridoAcao({}, formulario)).erro).toBeTruthy();

    formulario.set("slug", `${BASE}/eventos/${evento.slug}`);
    expect((await marcarEventoHibridoAcao({}, formulario)).ok).toContain("agora é híbrido");
    const lista = await eventosHibridos();
    expect(lista.map((e) => e.id)).toContain(evento.id);
    expect(lista.find((e) => e.id === evento.id)).toMatchObject({
      armazenamento: "hibrido",
      fotosDrive: 0,
    });

    expect(await voltarEventoParaR2Acao("nao-e-uuid")).toEqual({ erro: "Evento não encontrado." });
    expect((await voltarEventoParaR2Acao(evento.id)).ok).toBeTruthy();
    expect((await eventosHibridos()).map((e) => e.id)).not.toContain(evento.id);
  });

  it("testa a conexão: espaço, pasta e tempo, sem ids do Drive na resposta", async () => {
    expect(await testarConexaoDriveAcao()).toEqual({
      ok: false,
      erro: "Nenhuma conta do Google Drive conectada.",
    });
    await conectar();
    const resultado = await testarConexaoDriveAcao();
    expect(resultado).toMatchObject({
      ok: true,
      usadoBytes: 3 * 1024 ** 3,
      limiteBytes: 15 * 1024 ** 3,
      pastaOk: true,
    });
    expect(JSON.stringify(resultado)).not.toMatch(/pasta-raiz-id|ya29|1\/\//);
    expect((await situacaoDaConexaoDrive())?.ultimoUsoEm).not.toBeNull();
  });

  it("falha no teste grava o último erro sem segredo", async () => {
    await conectar();
    reiniciarArmazenamento();
    // A renovação do token passa a ser recusada (autorização revogada no Google).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) =>
        String(entrada).startsWith("https://oauth2.googleapis.com/token")
          ? json({ error: "invalid_grant" }, 400)
          : googleFalso(entrada, init),
      ),
    );
    const resultado = await testarConexaoDriveAcao();
    expect(resultado.ok).toBe(false);
    const conexao = await situacaoDaConexaoDrive();
    expect(conexao?.ultimoErro).toBeTruthy();
    expect(conexao?.ultimoErro).not.toMatch(/ya29|1\/\//);
  });

  it("desconectar revoga o refresh token e apaga a credencial", async () => {
    await conectar();
    expect(await lerCredencialDrive()).not.toBeNull();
    expect((await desconectarDriveAcao()).ok).toBe("Conta do Google Drive desconectada.");
    expect(google.revogados).toEqual([REFRESH]);
    expect(await lerCredencialDrive()).toBeNull();
  });
});
