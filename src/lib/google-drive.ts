// Google Drive da conta do dono como armazenamento de originais (protótipo). OAuth 2.0 com o
// escopo drive.file (o app só enxerga os arquivos que ele mesmo criou), num cliente OAuth
// separado do login: GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET.
//
// Só roda no servidor: client secret, refresh token e access token nunca vão para o navegador,
// e o download nunca expõe link do Drive (o site faz o streaming do corpo devolvido aqui).
// Nenhuma mensagem de erro leva token, corpo de requisição ou a mensagem crua do Google.
//
// Sem SDK: fetch nativo na Drive API v3.

import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";

const AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOGAR = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const API_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

const TIPO_PASTA = "application/vnd.google-apps.folder";

/** Tamanho de cada parte do upload resumable: 8 MiB, múltiplo de 256 KiB como o Drive exige. */
export const TAMANHO_DA_PARTE = 8 * 1024 * 1024;

/** Prazo para o Google responder (cabeçalhos) numa chamada comum e numa parte de upload. */
const PRAZO_MS = 30_000;
const PRAZO_PARTE_MS = 120_000;

const TENTATIVAS_PADRAO = 5;
const TETO_ESPERA_MS = 32_000;

// ---------------------------------------------------------------------------------- Erros

export type CodigoErroDrive =
  | "token_invalido"
  | "sem_permissao"
  | "nao_encontrado"
  | "quota"
  | "limite_de_taxa"
  | "rede"
  | "outro";

export class ErroDrive extends Error {
  codigo: CodigoErroDrive;
  status?: number;
  /** `reason` do Google (ex.: `storageQuotaExceeded`), quando veio. */
  motivo?: string;

  constructor(codigo: CodigoErroDrive, mensagem: string, status?: number, motivo?: string) {
    super(mensagem);
    this.name = "ErroDrive";
    this.codigo = codigo;
    this.status = status;
    this.motivo = motivo;
  }
}

const MOTIVOS_DE_TAXA = new Set(["userRateLimitExceeded", "rateLimitExceeded"]);
const MOTIVOS_DE_QUOTA = new Set([
  "storageQuotaExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "downloadQuotaExceeded",
]);
const MOTIVOS_SEM_PERMISSAO = new Set([
  "insufficientFilePermissions",
  "cannotDownloadAbusiveFile",
  "appNotAuthorizedToFile",
  "insufficientPermissions",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "forbidden",
  "domainPolicy",
]);

type ErroDoGoogle = { status: number; motivo?: string; mensagem?: string };

/** Lê o JSON de erro do Google ({ error: { errors: [{ reason }], message } }) sem quebrar. */
async function lerErroDoGoogle(resposta: Response): Promise<ErroDoGoogle> {
  const erro: ErroDoGoogle = { status: resposta.status };
  try {
    const corpo = (await resposta.json()) as {
      error?: {
        message?: unknown;
        status?: unknown;
        errors?: { reason?: unknown }[];
        details?: { reason?: unknown }[];
      };
    };
    const e = corpo?.error;
    const motivo = e?.errors?.[0]?.reason ?? e?.details?.[0]?.reason ?? e?.status;
    if (typeof motivo === "string") erro.motivo = motivo;
    if (typeof e?.message === "string") erro.mensagem = e.message;
  } catch {
    // Corpo vazio ou fora do formato: classifica só pelo status.
  }
  return erro;
}

function podeRepetir({ status, motivo }: ErroDoGoogle) {
  if (status === 429 || status === 408 || status >= 500) return true;
  return status === 403 && motivo !== undefined && MOTIVOS_DE_TAXA.has(motivo);
}

function classificar({ status, motivo, mensagem }: ErroDoGoogle): ErroDrive {
  const comMotivo = (texto: string) => (motivo ? `${texto} (${motivo})` : texto);
  if (status === 401) {
    return new ErroDrive(
      "token_invalido",
      "Acesso ao Google Drive expirou ou foi revogado",
      status,
      motivo,
    );
  }
  if (status === 404) {
    return new ErroDrive(
      "nao_encontrado",
      "Arquivo não encontrado no Google Drive",
      status,
      motivo,
    );
  }
  if (status === 429 || (motivo && MOTIVOS_DE_TAXA.has(motivo))) {
    return new ErroDrive("limite_de_taxa", "Google Drive pediu para esperar", status, motivo);
  }
  if (motivo && MOTIVOS_DE_QUOTA.has(motivo)) {
    return new ErroDrive("quota", comMotivo("Cota do Google Drive esgotada"), status, motivo);
  }
  if (status === 403) {
    // Malware/spam às vezes vem só na mensagem; a mensagem do Google não vai para o erro.
    const abuso = /malware|spam|abus/i.test(mensagem ?? "");
    if ((motivo && MOTIVOS_SEM_PERMISSAO.has(motivo)) || abuso || !motivo) {
      return new ErroDrive(
        "sem_permissao",
        comMotivo("Sem permissão no Google Drive"),
        status,
        motivo,
      );
    }
  }
  return new ErroDrive("outro", comMotivo(`Google Drive respondeu ${status}`), status, motivo);
}

function erroDeRede() {
  return new ErroDrive("rede", "Falha de rede ao falar com o Google");
}

/** Espera do backoff: 2^n s + até 1 s de jitter, com teto de 32 s (ou o Retry-After, se maior). */
function atraso(tentativa: number, retryAfter?: string | null) {
  const base = Math.min(2 ** tentativa * 1000 + Math.random() * 1000, TETO_ESPERA_MS);
  const pedido = Number(retryAfter);
  if (retryAfter && Number.isFinite(pedido) && pedido > 0) {
    return Math.min(Math.max(base, pedido * 1000), TETO_ESPERA_MS);
  }
  return base;
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** fetch com prazo só até os cabeçalhos chegarem: o corpo (download longo) não é cortado. */
async function buscar(url: string, init: RequestInit, prazoMs: number): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), prazoMs);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controle.signal });
  } finally {
    clearTimeout(relogio);
  }
}

/** Descarta o corpo sem ler (libera a conexão). */
function descartar(resposta: Response) {
  resposta.body?.cancel().catch(() => {});
}

// ---------------------------------------------------------------------------------- OAuth

type ConfigDrive = { clientId: string; clientSecret: string };

function configDrive(): ConfigDrive | null {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function exigirConfig(): ConfigDrive {
  const config = configDrive();
  if (!config) throw new ErroDrive("outro", "Google Drive não configurado");
  return config;
}

/** GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET preenchidos. */
export function driveConfigurado() {
  return configDrive() !== null;
}

/**
 * Endereço de consentimento do Google para conectar o Drive. `prompt=consent` + `access_type=
 * offline` garantem o refresh token mesmo numa reconexão; o `redirectUri` deve vir do APP_URL
 * configurado, nunca do Host da requisição, e o `state` precisa voltar igual no callback.
 */
export function urlDeAutorizacaoDrive(args: { redirectUri: string; state: string }): string {
  const config = exigirConfig();
  const url = new URL(AUTORIZACAO);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: ESCOPO_DRIVE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: args.state,
  }).toString();
  return url.toString();
}

const respostaDeToken = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

/** POST no endpoint de token; `invalid_grant` vira `token_invalido`. */
async function pedirToken(parametros: Record<string, string>) {
  let resposta: Response;
  try {
    resposta = await buscar(
      TOKEN,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(parametros),
      },
      PRAZO_MS,
    );
  } catch {
    throw erroDeRede();
  }
  if (!resposta.ok) {
    let codigo: unknown;
    try {
      codigo = ((await resposta.json()) as { error?: unknown })?.error;
    } catch {
      // sem corpo legível
    }
    if (codigo === "invalid_grant") {
      throw new ErroDrive(
        "token_invalido",
        "Autorização do Google Drive inválida ou revogada",
        resposta.status,
        codigo,
      );
    }
    const motivo = typeof codigo === "string" ? codigo : undefined;
    throw new ErroDrive(
      "outro",
      `Google recusou o token (${motivo ?? resposta.status})`,
      resposta.status,
      motivo,
    );
  }
  const dados = respostaDeToken.safeParse(await resposta.json().catch(() => null));
  if (!dados.success) throw new ErroDrive("outro", "Resposta de token inesperada do Google");
  return dados.data;
}

function expiraEm(segundos: number) {
  return new Date(Date.now() + segundos * 1000);
}

/**
 * Troca o código do callback pelos tokens. Exige o refresh token (sem ele não dá para usar o
 * Drive depois) e o escopo drive.file concedido (o consentimento granular deixa o usuário
 * desmarcar); sem um dos dois, revoga o que veio e lança.
 */
export async function trocarCodigoDrive(args: { code: string; redirectUri: string }): Promise<{
  accessToken: string;
  refreshToken: string;
  expiraEm: Date;
  escopo: string;
}> {
  const config = exigirConfig();
  const dados = await pedirToken({
    code: args.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  });
  const escopo = dados.scope ?? "";
  if (!dados.refresh_token) {
    await revogarToken(dados.access_token).catch(() => {});
    throw new ErroDrive("outro", "O Google não devolveu o refresh token");
  }
  if (!escopo.split(" ").includes(ESCOPO_DRIVE)) {
    await revogarToken(dados.refresh_token).catch(() => {});
    throw new ErroDrive("sem_permissao", "Acesso ao Google Drive não foi concedido");
  }
  return {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token,
    expiraEm: expiraEm(dados.expires_in),
    escopo,
  };
}

/** Novo access token a partir do refresh token. Revogado/expirado => ErroDrive "token_invalido". */
export async function renovarAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiraEm: Date }> {
  const config = exigirConfig();
  const dados = await pedirToken({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  return { accessToken: dados.access_token, expiraEm: expiraEm(dados.expires_in) };
}

/** Revoga o token (refresh ou access) no Google. 400 (já inválido) é ignorado. */
export async function revogarToken(token: string): Promise<void> {
  let resposta: Response;
  try {
    resposta = await buscar(
      REVOGAR,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      },
      PRAZO_MS,
    );
  } catch {
    throw erroDeRede();
  }
  descartar(resposta);
  if (resposta.ok || resposta.status === 400) return;
  throw new ErroDrive("outro", `Google não revogou o token (${resposta.status})`, resposta.status);
}

/** E-mail da conta Google dona do Drive, ou `null` se o Google não informar. */
export async function emailDaConta(accessToken: string): Promise<string | null> {
  const chamar = criarChamador(async () => accessToken);
  const resposta = await chamar({
    url: `${API}/about?fields=${encodeURIComponent("user(emailAddress)")}`,
  });
  const corpo = (await resposta.json()) as { user?: { emailAddress?: unknown } };
  const email = corpo?.user?.emailAddress;
  return typeof email === "string" && email ? email : null;
}

// ---------------------------------------------------------------------------------- Chamadas

/**
 * Devolve um access token válido. Com `renovar: true` (depois de um 401) deve buscar um novo no
 * Google em vez de devolver o que tem em cache; quem ignora o argumento também funciona.
 */
export type ObterAccessToken = (opcoes?: { renovar?: boolean }) => Promise<string>;

export type OpcoesClienteDrive = {
  /** Tentativas por chamada em erro temporário (429, 5xx, limite de taxa, rede). Padrão 5. */
  tentativas?: number;
  /** Espera entre tentativas; os testes passam uma que não dorme. */
  esperar?: (ms: number) => Promise<void>;
};

type Pedido = {
  url: string;
  metodo?: string;
  corpo?: BodyInit;
  cabecalhos?: Record<string, string>;
  /** Devolve a resposta 404 em vez de lançar (para quem trata ausência como `null`). */
  aceitar404?: boolean;
  prazoMs?: number;
};

/**
 * `chamar()`: autentica, repete 401 uma vez com token renovado, faz backoff exponencial em erro
 * temporário e classifica o resto em ErroDrive. Devolve a resposta 2xx sem ler o corpo.
 */
function criarChamador(obterAccessToken: ObterAccessToken, opcoes: OpcoesClienteDrive = {}) {
  const tentativas = Math.max(1, opcoes.tentativas ?? TENTATIVAS_PADRAO);
  const esperar = opcoes.esperar ?? dormir;

  return async function chamar(pedido: Pedido): Promise<Response> {
    let renovou = false;
    let tentativa = 0;
    for (;;) {
      const token = await obterAccessToken(renovou ? { renovar: true } : undefined);
      let resposta: Response;
      try {
        resposta = await buscar(
          pedido.url,
          {
            method: pedido.metodo ?? "GET",
            headers: { ...pedido.cabecalhos, Authorization: `Bearer ${token}` },
            body: pedido.corpo,
          },
          pedido.prazoMs ?? PRAZO_MS,
        );
      } catch {
        tentativa++;
        if (tentativa >= tentativas) throw erroDeRede();
        await esperar(atraso(tentativa - 1));
        continue;
      }

      if (resposta.ok) return resposta;
      if (resposta.status === 404 && pedido.aceitar404) {
        descartar(resposta);
        return resposta;
      }
      if (resposta.status === 401 && !renovou) {
        // Token expirado: pede outro uma vez, sem gastar tentativa.
        descartar(resposta);
        renovou = true;
        continue;
      }

      const erro = await lerErroDoGoogle(resposta);
      tentativa++;
      if (podeRepetir(erro) && tentativa < tentativas) {
        await esperar(atraso(tentativa - 1, resposta.headers.get("retry-after")));
        continue;
      }
      throw classificar(erro);
    }
  };
}

/** Escapa um valor para dentro de aspas simples numa query do files.list. */
function escaparNaQuery(valor: string) {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Próximo byte a enviar segundo o cabeçalho Range de um 308 ("bytes=0-N"); sem Range, 0. */
function proximoByte(resposta: Response) {
  const range = resposta.headers.get("range");
  const fim = range?.match(/bytes=\d+-(\d+)/)?.[1];
  return fim === undefined ? 0 : Number(fim) + 1;
}

// ---------------------------------------------------------------------------------- Cliente

export type MetadadosDrive = {
  id: string;
  nome: string;
  tamanho: number | null;
  md5: string | null;
  tipo: string | null;
  lixeira: boolean;
};

export type DownloadDrive = {
  corpo: ReadableStream<Uint8Array>;
  /** Bytes neste corpo (Content-Length, ou o trecho do Content-Range); `null` se não veio. */
  tamanho: number | null;
  status: 200 | 206;
  /** Content-Range devolvido num 206 ("bytes 0-99/1234"), com o tamanho total no fim. */
  contentRange?: string;
};

export type ClienteDrive = {
  /** Id da pasta `nome` dentro de `paiId` (ou da raiz); cria se não existir. */
  garantirPasta(nome: string, paiId: string | null): Promise<string>;
  /** Upload resumable em partes de 8 MiB, com retomada; confere tamanho e MD5 no fim. */
  enviarArquivo(args: {
    nome: string;
    pastaId: string;
    conteudo: Buffer;
    tipo: string;
    aoProgredir?: (bytes: number) => void;
  }): Promise<{ id: string; tamanho: number; md5: string | null }>;
  /**
   * Corpo do arquivo em streaming (nada é lido em memória). `range` segue o HTTP: `fim` é
   * INCLUSIVO e, omitido, vai até o fim do arquivo.
   */
  baixarArquivo(id: string, range?: { inicio: number; fim?: number }): Promise<DownloadDrive>;
  /** Arquivo inteiro em memória; acima de `limiteBytes` lança ErroDrive "outro". */
  lerArquivo(id: string, limiteBytes?: number): Promise<Buffer>;
  /** Metadados do arquivo, ou `null` se ele não existe (ou o app não o enxerga). */
  metadados(id: string): Promise<MetadadosDrive | null>;
  /** Apaga de vez (sem passar pela lixeira); arquivo inexistente é ignorado. */
  apagarArquivo(id: string): Promise<void>;
  espacoUsado(): Promise<{
    usadoBytes: number;
    limiteBytes: number | null;
    usadoNoDriveBytes: number;
    email: string | null;
  }>;
};

export function criarClienteDrive(
  obterAccessToken: ObterAccessToken,
  opcoes: OpcoesClienteDrive = {},
): ClienteDrive {
  const chamar = criarChamador(obterAccessToken, opcoes);
  const tentativas = Math.max(1, opcoes.tentativas ?? TENTATIVAS_PADRAO);
  const esperar = opcoes.esperar ?? dormir;
  const arquivo = (id: string) => `${API}/files/${encodeURIComponent(id)}`;

  async function metadados(id: string): Promise<MetadadosDrive | null> {
    const resposta = await chamar({
      url: `${arquivo(id)}?fields=${encodeURIComponent("id,name,size,md5Checksum,mimeType,trashed")}`,
      aceitar404: true,
    });
    if (resposta.status === 404) return null;
    const f = (await resposta.json()) as Record<string, unknown>;
    return {
      id: String(f.id),
      nome: typeof f.name === "string" ? f.name : "",
      tamanho: numeroOuNulo(f.size),
      md5: typeof f.md5Checksum === "string" ? f.md5Checksum : null,
      tipo: typeof f.mimeType === "string" ? f.mimeType : null,
      lixeira: f.trashed === true,
    };
  }

  async function apagarArquivo(id: string) {
    await chamar({ url: arquivo(id), metodo: "DELETE", aceitar404: true });
  }

  async function garantirPasta(nome: string, paiId: string | null) {
    const pai = paiId ?? "root";
    const q =
      `name = '${escaparNaQuery(nome)}' and mimeType = '${TIPO_PASTA}' ` +
      `and trashed = false and '${escaparNaQuery(pai)}' in parents`;
    const busca = new URLSearchParams({ q, fields: "files(id)", spaces: "drive", pageSize: "1" });
    const lista = (await (await chamar({ url: `${API}/files?${busca}` })).json()) as {
      files?: { id?: unknown }[];
    };
    const existente = lista.files?.[0]?.id;
    if (typeof existente === "string" && existente) return existente;

    const criada = (await (
      await chamar({
        url: `${API}/files?fields=id`,
        metodo: "POST",
        cabecalhos: { "Content-Type": "application/json; charset=UTF-8" },
        corpo: JSON.stringify({ name: nome, mimeType: TIPO_PASTA, parents: [pai] }),
      })
    ).json()) as { id?: unknown };
    if (typeof criada.id !== "string" || !criada.id) {
      throw new ErroDrive("outro", "O Google Drive não devolveu o id da pasta");
    }
    return criada.id;
  }

  async function enviarArquivo({
    nome,
    pastaId,
    conteudo,
    tipo,
    aoProgredir,
  }: Parameters<ClienteDrive["enviarArquivo"]>[0]) {
    const total = conteudo.length;
    if (total === 0) throw new ErroDrive("outro", "Arquivo vazio");

    // 1. Abre a sessão resumable; o endereço dela (Location) autoriza as partes sozinho e não
    //    vai para log nem para mensagem de erro.
    const inicio = await chamar({
      url: `${API_UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent("id,size,md5Checksum")}`,
      metodo: "POST",
      cabecalhos: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": tipo,
        "X-Upload-Content-Length": String(total),
      },
      corpo: JSON.stringify({ name: nome, parents: [pastaId] }),
    });
    descartar(inicio);
    const sessao = inicio.headers.get("location");
    if (!sessao) throw new ErroDrive("outro", "O Google Drive não abriu a sessão de envio");

    // 2. Partes de 8 MiB. 308 = continua de onde o Range diz; 5xx ou rede = espera, pergunta ao
    //    Drive quanto chegou (PUT vazio com "bytes */total") e retoma dali.
    let enviado = 0;
    let falhas = 0;
    let consultar = false;
    type RespostaFinal = { id?: unknown; size?: unknown; md5Checksum?: unknown };
    let final: RespostaFinal | null = null;
    for (;;) {
      const fim = Math.min(enviado + TAMANHO_DA_PARTE, total);
      let resposta: Response | null = null;
      try {
        resposta = await buscar(
          sessao,
          consultar
            ? { method: "PUT", headers: { "Content-Range": `bytes */${total}` } }
            : {
                method: "PUT",
                headers: { "Content-Range": `bytes ${enviado}-${fim - 1}/${total}` },
                // Buffer do Node é sempre sobre ArrayBuffer comum; sem cópia da parte.
                body: conteudo.subarray(enviado, fim) as Uint8Array<ArrayBuffer>,
              },
          PRAZO_PARTE_MS,
        );
      } catch {
        resposta = null;
      }

      if (resposta && (resposta.status === 200 || resposta.status === 201)) {
        final = (await resposta.json()) as RespostaFinal;
        break;
      }
      if (resposta?.status === 308) {
        descartar(resposta);
        enviado = proximoByte(resposta);
        if (enviado > total) throw new ErroDrive("outro", "O Google Drive confirmou bytes demais");
        consultar = false;
        falhas = 0;
        aoProgredir?.(enviado);
        continue;
      }
      if (resposta?.status === 404 || resposta?.status === 410) {
        descartar(resposta);
        throw new ErroDrive("outro", "A sessão de envio ao Google Drive expirou", resposta.status);
      }
      const erro = resposta ? await lerErroDoGoogle(resposta) : null;
      if (erro && !podeRepetir(erro)) throw classificar(erro);
      falhas++;
      if (falhas >= tentativas) throw erro ? classificar(erro) : erroDeRede();
      await esperar(atraso(falhas - 1, resposta?.headers.get("retry-after")));
      consultar = true;
    }

    // 3. Confere o que o Drive gravou; divergente é apagado para não ficar original corrompido.
    const id = typeof final.id === "string" ? final.id : "";
    if (!id) throw new ErroDrive("outro", "O Google Drive não devolveu o id do arquivo");
    let tamanho = numeroOuNulo(final.size);
    let md5 = typeof final.md5Checksum === "string" ? final.md5Checksum : null;
    if (tamanho === null) {
      const lidos = await metadados(id);
      tamanho = lidos?.tamanho ?? null;
      md5 ??= lidos?.md5 ?? null;
    }
    const md5Local = createHash("md5").update(conteudo).digest("hex");
    if (tamanho !== total || (md5 !== null && md5.toLowerCase() !== md5Local)) {
      await apagarArquivo(id).catch(() => {});
      throw new ErroDrive("outro", "O arquivo gravado no Google Drive não confere com o enviado");
    }
    aoProgredir?.(total);
    return { id, tamanho, md5 };
  }

  async function baixarArquivo(id: string, range?: { inicio: number; fim?: number }) {
    const cabecalhos: Record<string, string> = {};
    if (range) cabecalhos.Range = `bytes=${range.inicio}-${range.fim ?? ""}`;
    const resposta = await chamar({ url: `${arquivo(id)}?alt=media`, cabecalhos });
    if (!resposta.body)
      throw new ErroDrive("outro", "O Google Drive devolveu o arquivo sem conteúdo");
    const contentRange = resposta.headers.get("content-range") ?? undefined;
    let tamanho = numeroOuNulo(resposta.headers.get("content-length"));
    if (tamanho === null && contentRange) {
      const trecho = contentRange.match(/bytes (\d+)-(\d+)\//);
      if (trecho) tamanho = Number(trecho[2]) - Number(trecho[1]) + 1;
    }
    const download: DownloadDrive = {
      corpo: resposta.body,
      tamanho,
      status: resposta.status === 206 ? 206 : 200,
    };
    if (resposta.status === 206 && contentRange) download.contentRange = contentRange;
    return download;
  }

  async function lerArquivo(id: string, limiteBytes?: number) {
    const { corpo, tamanho } = await baixarArquivo(id);
    const grande = () => new ErroDrive("outro", "arquivo maior que o limite");
    if (limiteBytes !== undefined && tamanho !== null && tamanho > limiteBytes) {
      await corpo.cancel().catch(() => {});
      throw grande();
    }
    const leitor = corpo.getReader();
    const pedacos: Uint8Array[] = [];
    let lidos = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      lidos += value.byteLength;
      if (limiteBytes !== undefined && lidos > limiteBytes) {
        await leitor.cancel().catch(() => {});
        throw grande();
      }
      pedacos.push(value);
    }
    return Buffer.concat(pedacos, lidos);
  }

  async function espacoUsado() {
    const resposta = await chamar({
      url: `${API}/about?fields=${encodeURIComponent("storageQuota,user(emailAddress)")}`,
    });
    const corpo = (await resposta.json()) as {
      storageQuota?: { limit?: unknown; usage?: unknown; usageInDrive?: unknown };
      user?: { emailAddress?: unknown };
    };
    const cota = corpo.storageQuota ?? {};
    const email = corpo.user?.emailAddress;
    return {
      usadoBytes: numeroOuNulo(cota.usage) ?? 0,
      limiteBytes: numeroOuNulo(cota.limit),
      usadoNoDriveBytes: numeroOuNulo(cota.usageInDrive) ?? 0,
      email: typeof email === "string" && email ? email : null,
    };
  }

  return {
    garantirPasta,
    enviarArquivo,
    baixarArquivo,
    lerArquivo,
    metadados,
    apagarArquivo,
    espacoUsado,
  };
}
