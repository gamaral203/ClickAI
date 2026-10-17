import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  criarClienteDrive,
  driveConfigurado,
  emailDaConta,
  ErroDrive,
  ESCOPO_DRIVE,
  renovarAccessToken,
  revogarToken,
  TAMANHO_DA_PARTE,
  trocarCodigoDrive,
  urlDeAutorizacaoDrive,
} from "./google-drive";

type Chamada = { url: string; init: RequestInit };
type Resposta = Response | Error | ((chamada: Chamada) => Response);

/** Troca o fetch por uma fila de respostas, na ordem, e registra cada chamada. */
function filaDeFetch(respostas: Resposta[]) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const chamada = { url: String(url), init };
      chamadas.push(chamada);
      const proxima = respostas.shift();
      if (!proxima) throw new Error(`fetch inesperado: ${init.method ?? "GET"} ${url}`);
      if (proxima instanceof Error) throw proxima;
      return typeof proxima === "function" ? proxima(chamada) : proxima;
    }),
  );
  return chamadas;
}

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const erroGoogle = (status: number, reason: string, message = "detalhe do Google") =>
  json({ error: { code: status, message, errors: [{ reason, message }] } }, status);

const cabecalho = (c: Chamada, nome: string) => new Headers(c.init.headers).get(nome);

const corpoForm = (c: Chamada) => new URLSearchParams(String(c.init.body));

async function capturar(promessa: Promise<unknown>): Promise<ErroDrive> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDrive);
    return e as ErroDrive;
  }
  throw new Error("era para lançar");
}

const semEspera = () => {
  const esperas: number[] = [];
  return { esperas, esperar: async (ms: number) => void esperas.push(ms) };
};

function cliente(opcoes: { tentativas?: number } = {}) {
  const { esperas, esperar } = semEspera();
  const tokens = vi.fn(async (o?: { renovar?: boolean }) =>
    o?.renovar ? "token-novo" : "token-1",
  );
  return { drive: criarClienteDrive(tokens, { ...opcoes, esperar }), tokens, esperas };
}

const MiB = 1024 * 1024;

beforeEach(() => {
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "id-do-cliente");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "segredo-do-cliente");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OAuth do Drive", () => {
  it("driveConfigurado depende das duas variáveis", () => {
    expect(driveConfigurado()).toBe(true);
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "");
    expect(driveConfigurado()).toBe(false);
  });

  it("monta a URL de autorização com os parâmetros certos", () => {
    const url = new URL(
      urlDeAutorizacaoDrive({
        redirectUri: "https://clicouai.com/api/drive/callback",
        state: "abc",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "id-do-cliente",
      redirect_uri: "https://clicouai.com/api/drive/callback",
      response_type: "code",
      scope: ESCOPO_DRIVE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state: "abc",
    });
    expect(url.toString()).not.toContain("segredo-do-cliente");
  });

  it("troca o código pelos tokens", async () => {
    const chamadas = filaDeFetch([
      json({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3599,
        scope: ESCOPO_DRIVE,
        token_type: "Bearer",
      }),
    ]);
    const antes = Date.now();
    const r = await trocarCodigoDrive({ code: "codigo", redirectUri: "https://x/cb" });
    expect(r).toMatchObject({ accessToken: "at", refreshToken: "rt", escopo: ESCOPO_DRIVE });
    expect(r.expiraEm.getTime()).toBeGreaterThanOrEqual(antes + 3599_000);
    expect(chamadas[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(chamadas[0].init.method).toBe("POST");
    expect(Object.fromEntries(corpoForm(chamadas[0]))).toEqual({
      code: "codigo",
      client_id: "id-do-cliente",
      client_secret: "segredo-do-cliente",
      redirect_uri: "https://x/cb",
      grant_type: "authorization_code",
    });
  });

  it("sem refresh_token, revoga o access token e lança", async () => {
    const chamadas = filaDeFetch([
      json({ access_token: "at", expires_in: 3599, scope: ESCOPO_DRIVE }),
      new Response(null, { status: 200 }),
    ]);
    const erro = await capturar(trocarCodigoDrive({ code: "c", redirectUri: "https://x/cb" }));
    expect(erro.codigo).toBe("outro");
    expect(chamadas[1].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(corpoForm(chamadas[1]).get("token")).toBe("at");
  });

  it("sem o escopo drive.file concedido, revoga e lança sem_permissao", async () => {
    const chamadas = filaDeFetch([
      json({ access_token: "at", refresh_token: "rt", expires_in: 3599, scope: "openid" }),
      new Response(null, { status: 200 }),
    ]);
    const erro = await capturar(trocarCodigoDrive({ code: "c", redirectUri: "https://x/cb" }));
    expect(erro.codigo).toBe("sem_permissao");
    expect(corpoForm(chamadas[1]).get("token")).toBe("rt");
  });

  it("renova o access token", async () => {
    const chamadas = filaDeFetch([
      json({ access_token: "novo", expires_in: 3600, scope: ESCOPO_DRIVE }),
    ]);
    const r = await renovarAccessToken("rt");
    expect(r.accessToken).toBe("novo");
    expect(r.expiraEm.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    expect(Object.fromEntries(corpoForm(chamadas[0]))).toMatchObject({
      refresh_token: "rt",
      grant_type: "refresh_token",
    });
  });

  it("invalid_grant vira token_invalido sem vazar o token", async () => {
    filaDeFetch([
      json(
        { error: "invalid_grant", error_description: "Token has been expired or revoked." },
        400,
      ),
    ]);
    const erro = await capturar(renovarAccessToken("refresh-secreto"));
    expect(erro.codigo).toBe("token_invalido");
    expect(erro.status).toBe(400);
    expect(erro.message).not.toContain("refresh-secreto");
  });

  it("revogarToken ignora 400 e lança em 500", async () => {
    filaDeFetch([new Response(null, { status: 400 })]);
    await expect(revogarToken("t")).resolves.toBeUndefined();
    filaDeFetch([new Response(null, { status: 500 })]);
    expect((await capturar(revogarToken("t"))).codigo).toBe("outro");
  });

  it("emailDaConta lê o about", async () => {
    const chamadas = filaDeFetch([json({ user: { emailAddress: "dono@gmail.com" } })]);
    expect(await emailDaConta("at")).toBe("dono@gmail.com");
    const url = new URL(chamadas[0].url);
    expect(url.pathname).toBe("/drive/v3/about");
    expect(url.searchParams.get("fields")).toBe("user(emailAddress)");
    expect(cabecalho(chamadas[0], "authorization")).toBe("Bearer at");
  });
});

describe("garantirPasta", () => {
  it("acha a pasta existente, com o nome escapado na query", async () => {
    const chamadas = filaDeFetch([json({ files: [{ id: "pasta-1" }] })]);
    const { drive } = cliente();
    expect(await drive.garantirPasta("D'Ávila \\ 2026", "pai-9")).toBe("pasta-1");
    expect(chamadas).toHaveLength(1);
    const url = new URL(chamadas[0].url);
    expect(url.pathname).toBe("/drive/v3/files");
    expect(url.searchParams.get("fields")).toBe("files(id)");
    expect(url.searchParams.get("q")).toBe(
      "name = 'D\\'Ávila \\\\ 2026' and mimeType = 'application/vnd.google-apps.folder' " +
        "and trashed = false and 'pai-9' in parents",
    );
    expect(cabecalho(chamadas[0], "authorization")).toBe("Bearer token-1");
  });

  it("cria na raiz quando não acha", async () => {
    const chamadas = filaDeFetch([json({ files: [] }), json({ id: "nova" })]);
    const { drive } = cliente();
    expect(await drive.garantirPasta("ClicouAí", null)).toBe("nova");
    expect(new URL(chamadas[0].url).searchParams.get("q")).toContain("'root' in parents");
    expect(chamadas[1].init.method).toBe("POST");
    expect(JSON.parse(String(chamadas[1].init.body))).toEqual({
      name: "ClicouAí",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    });
  });
});

describe("enviarArquivo", () => {
  const SESSAO =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=xyz";
  const abrirSessao = () => new Response(null, { status: 200, headers: { Location: SESSAO } });
  const recebidoAte = (ultimo: number) =>
    new Response(null, { status: 308, headers: { Range: `bytes=0-${ultimo}` } });
  const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

  function arquivo(tamanho: number) {
    const b = Buffer.alloc(tamanho);
    for (let i = 0; i < tamanho; i += 4096) b[i] = i % 251;
    return b;
  }

  it("envia 20 MiB em 3 partes com Content-Range exato", async () => {
    const conteudo = arquivo(20 * MiB);
    const total = conteudo.length;
    const chamadas = filaDeFetch([
      abrirSessao(),
      recebidoAte(8 * MiB - 1),
      recebidoAte(16 * MiB - 1),
      json({ id: "arq-1", size: String(total), md5Checksum: md5(conteudo) }, 200),
    ]);
    const { drive } = cliente();
    const progresso: number[] = [];
    const r = await drive.enviarArquivo({
      nome: "IMG_0001.jpg",
      pastaId: "pasta-1",
      conteudo,
      tipo: "image/jpeg",
      aoProgredir: (b) => progresso.push(b),
    });
    expect(r).toEqual({ id: "arq-1", tamanho: total, md5: md5(conteudo) });

    const inicio = chamadas[0];
    const url = new URL(inicio.url);
    expect(url.pathname).toBe("/upload/drive/v3/files");
    expect(url.searchParams.get("uploadType")).toBe("resumable");
    expect(url.searchParams.get("fields")).toBe("id,size,md5Checksum");
    expect(cabecalho(inicio, "x-upload-content-type")).toBe("image/jpeg");
    expect(cabecalho(inicio, "x-upload-content-length")).toBe(String(total));
    expect(JSON.parse(String(inicio.init.body))).toEqual({
      name: "IMG_0001.jpg",
      parents: ["pasta-1"],
    });

    const partes = chamadas.slice(1);
    expect(partes.map((c) => c.url)).toEqual([SESSAO, SESSAO, SESSAO]);
    expect(partes.map((c) => c.init.method)).toEqual(["PUT", "PUT", "PUT"]);
    expect(partes.map((c) => cabecalho(c, "content-range"))).toEqual([
      `bytes 0-8388607/${total}`,
      `bytes 8388608-16777215/${total}`,
      `bytes 16777216-20971519/${total}`,
    ]);
    expect(partes.map((c) => (c.init.body as Uint8Array).byteLength)).toEqual([
      8 * MiB,
      8 * MiB,
      4 * MiB,
    ]);
    expect(
      Buffer.from(partes[1].init.body as Uint8Array).equals(conteudo.subarray(8 * MiB, 16 * MiB)),
    ).toBe(true);
    expect(progresso).toEqual([8 * MiB, 16 * MiB, total]);
    expect(TAMANHO_DA_PARTE % (256 * 1024)).toBe(0);
  });

  it("retoma depois de um 503 consultando quanto chegou", async () => {
    const conteudo = arquivo(20 * MiB);
    const total = conteudo.length;
    const chamadas = filaDeFetch([
      abrirSessao(),
      new Response("Service Unavailable", { status: 503 }),
      recebidoAte(4 * MiB - 1),
      recebidoAte(12 * MiB - 1),
      json({ id: "arq-2", size: String(total), md5Checksum: md5(conteudo) }, 201),
    ]);
    const { drive, esperas } = cliente();
    const r = await drive.enviarArquivo({
      nome: "a.jpg",
      pastaId: "p",
      conteudo,
      tipo: "image/jpeg",
    });
    expect(r.id).toBe("arq-2");
    expect(esperas).toHaveLength(1);
    const ranges = chamadas.slice(1).map((c) => cabecalho(c, "content-range"));
    expect(ranges).toEqual([
      `bytes 0-8388607/${total}`,
      `bytes */${total}`,
      `bytes 4194304-12582911/${total}`,
      `bytes 12582912-20971519/${total}`,
    ]);
    expect(chamadas[2].init.body).toBeUndefined();
  });

  it("retoma depois de erro de rede; consulta sem Range recomeça do zero", async () => {
    const conteudo = arquivo(1 * MiB);
    const chamadas = filaDeFetch([
      abrirSessao(),
      new TypeError("fetch failed"),
      new Response(null, { status: 308 }),
      json({ id: "arq-3", size: String(conteudo.length) }, 200),
    ]);
    const { drive } = cliente();
    const r = await drive.enviarArquivo({
      nome: "a.jpg",
      pastaId: "p",
      conteudo,
      tipo: "image/jpeg",
    });
    expect(r).toEqual({ id: "arq-3", tamanho: conteudo.length, md5: null });
    expect(chamadas.slice(1).map((c) => cabecalho(c, "content-range"))).toEqual([
      `bytes 0-1048575/1048576`,
      `bytes */1048576`,
      `bytes 0-1048575/1048576`,
    ]);
  });

  it("tamanho divergente apaga o arquivo e lança", async () => {
    const conteudo = arquivo(1 * MiB);
    const chamadas = filaDeFetch([
      abrirSessao(),
      json({ id: "arq-ruim", size: "1000" }, 200),
      new Response(null, { status: 204 }),
    ]);
    const { drive } = cliente();
    const erro = await capturar(
      drive.enviarArquivo({ nome: "a.jpg", pastaId: "p", conteudo, tipo: "image/jpeg" }),
    );
    expect(erro.codigo).toBe("outro");
    expect(chamadas[2].init.method).toBe("DELETE");
    expect(new URL(chamadas[2].url).pathname).toBe("/drive/v3/files/arq-ruim");
  });

  it("MD5 divergente também apaga e lança", async () => {
    const conteudo = arquivo(1 * MiB);
    const chamadas = filaDeFetch([
      abrirSessao(),
      json({ id: "arq-md5", size: String(conteudo.length), md5Checksum: "0".repeat(32) }, 200),
      new Response(null, { status: 204 }),
    ]);
    const { drive } = cliente();
    await capturar(
      drive.enviarArquivo({ nome: "a.jpg", pastaId: "p", conteudo, tipo: "image/jpeg" }),
    );
    expect(chamadas[2].init.method).toBe("DELETE");
  });

  it("recusa arquivo vazio sem chamar o Google", async () => {
    const chamadas = filaDeFetch([]);
    const { drive } = cliente();
    const erro = await capturar(
      drive.enviarArquivo({
        nome: "a",
        pastaId: "p",
        conteudo: Buffer.alloc(0),
        tipo: "image/jpeg",
      }),
    );
    expect(erro.codigo).toBe("outro");
    expect(chamadas).toHaveLength(0);
  });

  it("cota cheia ao abrir a sessão vira quota", async () => {
    filaDeFetch([erroGoogle(403, "storageQuotaExceeded")]);
    const { drive } = cliente();
    const erro = await capturar(
      drive.enviarArquivo({
        nome: "a",
        pastaId: "p",
        conteudo: Buffer.alloc(10),
        tipo: "image/jpeg",
      }),
    );
    expect(erro.codigo).toBe("quota");
  });
});

describe("baixarArquivo e lerArquivo", () => {
  const corpoEmStream = (bytes: Uint8Array, headers: Record<string, string>, status = 200) =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.subarray(0, Math.floor(bytes.length / 2)));
          c.enqueue(bytes.subarray(Math.floor(bytes.length / 2)));
          c.close();
        },
      }),
      { status, headers },
    );

  it("baixa um trecho (206) com Range", async () => {
    const chamadas = filaDeFetch([
      new Response(new Uint8Array(100), {
        status: 206,
        headers: { "Content-Length": "100", "Content-Range": "bytes 100-199/5000" },
      }),
    ]);
    const { drive } = cliente();
    const r = await drive.baixarArquivo("arq/1", { inicio: 100, fim: 199 });
    expect(r.status).toBe(206);
    expect(r.tamanho).toBe(100);
    expect(r.contentRange).toBe("bytes 100-199/5000");
    expect(r.corpo).toBeInstanceOf(ReadableStream);
    expect(chamadas[0].url).toBe("https://www.googleapis.com/drive/v3/files/arq%2F1?alt=media");
    expect(cabecalho(chamadas[0], "range")).toBe("bytes=100-199");
  });

  it("range aberto e tamanho pelo Content-Range quando falta Content-Length", async () => {
    const chamadas = filaDeFetch([
      corpoEmStream(new Uint8Array(4900), { "Content-Range": "bytes 100-4999/5000" }, 206),
    ]);
    const { drive } = cliente();
    const r = await drive.baixarArquivo("a", { inicio: 100 });
    expect(cabecalho(chamadas[0], "range")).toBe("bytes=100-");
    expect(r.tamanho).toBe(4900);
  });

  it("baixa o arquivo inteiro (200) sem Range", async () => {
    const chamadas = filaDeFetch([
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Length": "3" } }),
    ]);
    const { drive } = cliente();
    const r = await drive.baixarArquivo("a");
    expect(r.status).toBe(200);
    expect(r.tamanho).toBe(3);
    expect(r.contentRange).toBeUndefined();
    expect(cabecalho(chamadas[0], "range")).toBeNull();
    expect(Buffer.from(await new Response(r.corpo).arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("arquivo marcado como abusivo vira sem_permissao", async () => {
    filaDeFetch([
      erroGoogle(403, "cannotDownloadAbusiveFile", "This file has been identified as malware"),
    ]);
    const { drive } = cliente();
    expect((await capturar(drive.baixarArquivo("a"))).codigo).toBe("sem_permissao");
  });

  it("lerArquivo junta o corpo em Buffer dentro do limite", async () => {
    const bytes = new Uint8Array([9, 8, 7, 6, 5]);
    filaDeFetch([corpoEmStream(bytes, { "Content-Length": "5" })]);
    const { drive } = cliente();
    expect(await drive.lerArquivo("a", 5)).toEqual(Buffer.from(bytes));
  });

  it("lerArquivo recusa pelo Content-Length acima do limite", async () => {
    filaDeFetch([corpoEmStream(new Uint8Array(10), { "Content-Length": "10" })]);
    const { drive } = cliente();
    const erro = await capturar(drive.lerArquivo("a", 9));
    expect(erro.codigo).toBe("outro");
    expect(erro.message).toBe("arquivo maior que o limite");
  });

  it("lerArquivo recusa pelo que leu quando não há Content-Length", async () => {
    filaDeFetch([corpoEmStream(new Uint8Array(10), {})]);
    const { drive } = cliente();
    expect((await capturar(drive.lerArquivo("a", 6))).message).toBe("arquivo maior que o limite");
  });
});

describe("metadados, apagar e espaço", () => {
  it("metadados mapeia os campos", async () => {
    const chamadas = filaDeFetch([
      json({
        id: "a",
        name: "IMG.jpg",
        size: "123",
        md5Checksum: "abc",
        mimeType: "image/jpeg",
        trashed: true,
      }),
    ]);
    const { drive } = cliente();
    expect(await drive.metadados("a")).toEqual({
      id: "a",
      nome: "IMG.jpg",
      tamanho: 123,
      md5: "abc",
      tipo: "image/jpeg",
      lixeira: true,
    });
    expect(new URL(chamadas[0].url).searchParams.get("fields")).toBe(
      "id,name,size,md5Checksum,mimeType,trashed",
    );
  });

  it("metadados de arquivo inexistente é null", async () => {
    filaDeFetch([erroGoogle(404, "notFound")]);
    const { drive } = cliente();
    expect(await drive.metadados("sumiu")).toBeNull();
  });

  it("apagarArquivo ignora 404", async () => {
    const chamadas = filaDeFetch([erroGoogle(404, "notFound")]);
    const { drive } = cliente();
    await expect(drive.apagarArquivo("sumiu")).resolves.toBeUndefined();
    expect(chamadas[0].init.method).toBe("DELETE");
  });

  it("baixar arquivo inexistente lança nao_encontrado", async () => {
    filaDeFetch([erroGoogle(404, "notFound")]);
    const { drive } = cliente();
    expect((await capturar(drive.baixarArquivo("sumiu"))).codigo).toBe("nao_encontrado");
  });

  it("espacoUsado lê a cota e o e-mail", async () => {
    const chamadas = filaDeFetch([
      json({
        storageQuota: {
          limit: "16106127360",
          usage: "5000",
          usageInDrive: "4000",
          usageInDriveTrash: "0",
        },
        user: { emailAddress: "dono@gmail.com" },
      }),
    ]);
    const { drive } = cliente();
    expect(await drive.espacoUsado()).toEqual({
      usadoBytes: 5000,
      limiteBytes: 16106127360,
      usadoNoDriveBytes: 4000,
      email: "dono@gmail.com",
    });
    expect(new URL(chamadas[0].url).searchParams.get("fields")).toBe(
      "storageQuota,user(emailAddress)",
    );
  });

  it("espacoUsado sem limite (armazenamento ilimitado) devolve null", async () => {
    filaDeFetch([json({ storageQuota: { usage: "1", usageInDrive: "1" } })]);
    const { drive } = cliente();
    expect(await drive.espacoUsado()).toMatchObject({ limiteBytes: null, email: null });
  });
});

describe("chamar: retentativas e renovação", () => {
  it("faz backoff em 429 e desiste depois das tentativas", async () => {
    const chamadas = filaDeFetch([
      erroGoogle(429, "rateLimitExceeded"),
      erroGoogle(429, "rateLimitExceeded"),
      erroGoogle(429, "rateLimitExceeded"),
    ]);
    const { drive, esperas } = cliente({ tentativas: 3 });
    const erro = await capturar(drive.metadados("a"));
    expect(erro.codigo).toBe("limite_de_taxa");
    expect(chamadas).toHaveLength(3);
    expect(esperas).toHaveLength(2);
    expect(esperas[0]).toBeGreaterThanOrEqual(1000);
    expect(esperas[0]).toBeLessThan(2000);
    expect(esperas[1]).toBeGreaterThanOrEqual(2000);
    expect(esperas[1]).toBeLessThan(3000);
  });

  it("403 userRateLimitExceeded repete e se recupera", async () => {
    const chamadas = filaDeFetch([
      erroGoogle(403, "userRateLimitExceeded"),
      json({ files: [{ id: "p" }] }),
    ]);
    const { drive, esperas } = cliente();
    expect(await drive.garantirPasta("x", null)).toBe("p");
    expect(chamadas).toHaveLength(2);
    expect(esperas).toHaveLength(1);
  });

  it("5xx repete com o padrão de 5 tentativas e teto de 32 s", async () => {
    filaDeFetch(Array.from({ length: 5 }, () => erroGoogle(500, "backendError")));
    const { drive, esperas } = cliente();
    const erro = await capturar(drive.espacoUsado());
    expect(erro.codigo).toBe("outro");
    expect(erro.status).toBe(500);
    expect(esperas).toHaveLength(4);
    expect(Math.max(...esperas)).toBeLessThanOrEqual(32_000);
  });

  it("403 de cota não repete", async () => {
    const chamadas = filaDeFetch([erroGoogle(403, "dailyLimitExceeded")]);
    const { drive, esperas } = cliente();
    expect((await capturar(drive.espacoUsado())).codigo).toBe("quota");
    expect(chamadas).toHaveLength(1);
    expect(esperas).toHaveLength(0);
  });

  it("401 pede token renovado uma vez e repete", async () => {
    const chamadas = filaDeFetch([erroGoogle(401, "authError"), json({ files: [{ id: "p" }] })]);
    const { drive, tokens } = cliente();
    expect(await drive.garantirPasta("x", null)).toBe("p");
    expect(tokens).toHaveBeenCalledTimes(2);
    expect(tokens.mock.calls[1][0]).toEqual({ renovar: true });
    expect(cabecalho(chamadas[0], "authorization")).toBe("Bearer token-1");
    expect(cabecalho(chamadas[1], "authorization")).toBe("Bearer token-novo");
  });

  it("401 de novo depois de renovar vira token_invalido sem vazar o token", async () => {
    filaDeFetch([erroGoogle(401, "authError"), erroGoogle(401, "authError")]);
    const { drive } = cliente();
    const erro = await capturar(drive.espacoUsado());
    expect(erro.codigo).toBe("token_invalido");
    expect(erro.message).not.toMatch(/token-1|token-novo/);
  });

  it("falha de rede repetida vira rede", async () => {
    const chamadas = filaDeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    const { drive, esperas } = cliente({ tentativas: 2 });
    expect((await capturar(drive.espacoUsado())).codigo).toBe("rede");
    expect(chamadas).toHaveLength(2);
    expect(esperas).toHaveLength(1);
  });

  it("mensagem do Google não entra no erro", async () => {
    filaDeFetch([erroGoogle(400, "badRequest", "dono@gmail.com fez algo")]);
    const { drive } = cliente();
    const erro = await capturar(drive.espacoUsado());
    expect(erro.codigo).toBe("outro");
    expect(erro.motivo).toBe("badRequest");
    expect(erro.message).not.toContain("dono@gmail.com");
  });
});
