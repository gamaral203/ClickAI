import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import {
  apagarCredencialDrive,
  FINALIDADE_REFRESH_TOKEN_DRIVE,
  fotosNoDrive,
  gravarCredencialDrive,
  lerCredencialDrive,
  registrarErroDrive,
  registrarUsoDrive,
  situacaoDaConexaoDrive,
  umArquivoNoDrive,
} from "@/dados/configuracoes";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import {
  clienteDriveConectado,
  esquecerAcessoDrive,
  provedorDeOriginais,
} from "@/lib/armazenamento";
import {
  type CodigoErroDrive,
  criarClienteDrive,
  driveConfigurado,
  emailDaConta,
  ErroDrive,
  revogarToken,
  trocarCodigoDrive,
  urlDeAutorizacaoDrive,
} from "@/lib/google-drive";
import { decifrarSegredo } from "@/lib/segredo-cifrado";

// Conexão da conta do Google Drive pela gestão (protótipo de originais; docs/arquitetura.md,
// "Armazenamento experimental"). As rotas de /api/admin/armazenamento/google e as ações da tela
// /admin/armazenamento só conferem o gestor e chamam daqui.
//
// O `state` do OAuth é um token assinado (src/lib/assinatura.ts) com o id do gestor e validade
// de 10 minutos, guardado também num cookie HttpOnly de uso único: a volta só vale no mesmo
// navegador e para o mesmo gestor que começou (proteção contra CSRF de conexão). Código,
// tokens e ids do Drive nunca vão a log, ao navegador nem à URL de volta.

/** Cookie com o `state` da conexão. Vive só os 10 minutos do vai e volta. */
export const COOKIE_DRIVE = "clicouai_drive";
/** Caminho do cookie: só as rotas da conexão o recebem. */
export const CAMINHO_COOKIE_DRIVE = "/api/admin/armazenamento/google";
export const VALIDADE_STATE_MS = 10 * 60 * 1000;

const PROPOSITO_STATE = "drive-oauth-state";

/** APP_URL sem a barra do fim, ou `null`. O endereço de volta nunca vem do Host da requisição. */
function appUrl(): string | null {
  const url = process.env.APP_URL;
  return url ? url.replace(/\/$/, "") : null;
}

/** GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET e APP_URL preenchidos. */
export function conexaoDriveConfigurada() {
  return driveConfigurado() && appUrl() !== null;
}

export function redirectUriDrive(): string {
  const base = appUrl();
  if (!base) throw new Error("APP_URL ausente");
  return `${base}${CAMINHO_COOKIE_DRIVE}/callback`;
}

/**
 * Endereço de consentimento do Google e o `state` que precisa voltar igual. `contaEmail` (a
 * conta que precisa ser a mesma) vai como sugestão de login ao Google.
 */
export function iniciarConexaoDrive(
  usuarioId: string,
  contaEmail?: string | null,
): { url: string; state: string } {
  const state = assinar(
    PROPOSITO_STATE,
    { u: usuarioId, n: randomBytes(16).toString("base64url") },
    VALIDADE_STATE_MS,
  );
  const url = urlDeAutorizacaoDrive({
    redirectUri: redirectUriDrive(),
    state,
    loginHint: contaEmail ?? undefined,
  });
  return { url, state };
}

/**
 * Conta do Drive que precisa continuar conectada: a gravada, quando algum original (mesmo de
 * foto excluída) está nela. O escopo `drive.file` só enxerga os arquivos da própria conta;
 * trocar de conta ou desconectar deixaria esses originais inacessíveis. `null` quando a troca
 * está livre (nenhuma conta conectada ou nenhum original no Drive).
 */
export async function contaPresaAoDrive(): Promise<{
  contaEmail: string | null;
  fotos: number;
} | null> {
  const conexao = await situacaoDaConexaoDrive();
  if (!conexao) return null;
  const fotos = await fotosNoDrive();
  return fotos > 0 ? { contaEmail: conexao.contaEmail, fotos } : null;
}

const mesmoEmail = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A conta que acabou de autorizar é a mesma que guarda os originais. Pelo e-mail, quando os
 * dois são conhecidos; senão, se o token novo enxerga um original já gravado (o `drive.file`
 * só mostra os arquivos da própria conta).
 */
async function mesmaContaDosOriginais(
  gravado: string | null,
  novo: string | null,
  accessToken: string,
): Promise<boolean> {
  if (gravado && novo) return mesmoEmail(gravado, novo);
  const arquivo = await umArquivoNoDrive();
  if (!arquivo) return false;
  try {
    const meta = await criarClienteDrive(async () => accessToken, { tentativas: 2 }).metadados(
      arquivo,
    );
    return !!meta;
  } catch {
    return false;
  }
}

function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * O `state` da volta confere com o do cookie, a assinatura vale, está no prazo e é deste gestor.
 */
export function stateDriveValido(
  state: string | null,
  doCookie: string | null | undefined,
  usuarioId: string,
): boolean {
  if (!state || !doCookie || !iguais(state, doCookie)) return false;
  const dados = conferirAssinatura(PROPOSITO_STATE, state) as { u?: unknown } | null;
  return !!dados && dados.u === usuarioId;
}

/** Códigos curtos do `?erro=` da tela; a tela traduz cada um. */
export type ErroConexaoDrive = "sem_permissao" | "token" | "pasta" | "falha" | "conta_diferente";

/**
 * Troca o código pelos tokens, lê o e-mail da conta, grava a credencial (cifrada) e cria a pasta
 * raiz `ClicouAI_Storage`. Devolve `null` no sucesso ou o código curto do erro.
 */
export async function concluirConexaoDrive(
  code: string,
  usuarioId: string,
): Promise<ErroConexaoDrive | null> {
  let tokens: Awaited<ReturnType<typeof trocarCodigoDrive>>;
  try {
    tokens = await trocarCodigoDrive({ code, redirectUri: redirectUriDrive() });
  } catch (erro) {
    registrarFalha("troca do código", erro);
    if (erro instanceof ErroDrive && erro.codigo === "sem_permissao") return "sem_permissao";
    return "token";
  }

  // Sem o e-mail a conexão funciona; só a tela fica sem mostrar a conta.
  const contaEmail = await emailDaConta(tokens.accessToken).catch(() => null);

  // Com originais no Drive, só a MESMA conta pode voltar (para renovar uma autorização
  // revogada): outra conta não enxergaria os arquivos gravados. O token novo é revogado e a
  // credencial atual fica como estava.
  const presa = await contaPresaAoDrive();
  if (presa && !(await mesmaContaDosOriginais(presa.contaEmail, contaEmail, tokens.accessToken))) {
    await revogarToken(tokens.refreshToken).catch(() => {});
    return "conta_diferente";
  }

  try {
    await gravarCredencialDrive({
      refreshToken: tokens.refreshToken,
      contaEmail,
      escopo: tokens.escopo,
      usuarioId,
    });
  } catch (erro) {
    registrarFalha("gravação da credencial", erro);
    await revogarToken(tokens.refreshToken).catch(() => {});
    return "falha";
  }
  esquecerAcessoDrive();

  try {
    // Cria (ou acha) a pasta raiz e guarda o id. Se falhar, o próximo uso tenta de novo.
    await provedorDeOriginais("drive");
  } catch (erro) {
    registrarFalha("pasta raiz", erro);
    return "pasta";
  }
  return null;
}

/** Só o nome e o código do erro no log: a resposta do Google pode trazer o código ou o token. */
function registrarFalha(etapa: string, erro: unknown) {
  console.error(
    `Falha ao conectar o Google Drive (${etapa})`,
    erro instanceof ErroDrive
      ? `ErroDrive:${erro.codigo}`
      : erro instanceof Error
        ? erro.name
        : "desconhecido",
  );
}

const MENSAGEM_DO_ERRO: Record<CodigoErroDrive, string> = {
  token_invalido: "A autorização do Google expirou ou foi revogada. Conecte a conta de novo.",
  sem_permissao: "O Google recusou o acesso à pasta do ClicouAí.",
  nao_encontrado: "O Google Drive não encontrou o que foi pedido.",
  quota: "A cota do Google Drive acabou.",
  limite_de_taxa: "O Google Drive pediu para esperar. Tente de novo em alguns minutos.",
  rede: "Não foi possível falar com o Google agora. Tente de novo.",
  outro: "O Google Drive respondeu com erro. Tente de novo.",
};

export type ResultadoTesteDrive =
  | {
      ok: true;
      latenciaMs: number;
      usadoBytes: number;
      limiteBytes: number | null;
      /** A pasta `ClicouAI_Storage` existe e não está na lixeira. */
      pastaOk: boolean;
    }
  | { ok: false; erro: string };

/**
 * Testa a conexão: lê o espaço usado e os metadados da pasta raiz, medindo o tempo. Falha do
 * Drive fica gravada como último erro (sem segredo); sucesso marca o último uso.
 */
export async function testarConexaoDrive(): Promise<ResultadoTesteDrive> {
  const conexao = await situacaoDaConexaoDrive();
  if (!conexao) return { ok: false, erro: "Nenhuma conta do Google Drive conectada." };
  const inicio = performance.now();
  try {
    const cliente = await clienteDriveConectado();
    const espaco = await cliente.espacoUsado();
    const pasta = conexao.pastaRaizId ? await cliente.metadados(conexao.pastaRaizId) : null;
    const latenciaMs = Math.round(performance.now() - inicio);
    await registrarUsoDrive().catch(() => {});
    return {
      ok: true,
      latenciaMs,
      usadoBytes: espaco.usadoBytes,
      limiteBytes: espaco.limiteBytes,
      pastaOk: !!pasta && !pasta.lixeira,
    };
  } catch (erro) {
    await registrarErroDrive(erro).catch(() => {});
    if (erro instanceof ErroDrive) {
      if (erro.codigo === "token_invalido") esquecerAcessoDrive();
      return { ok: false, erro: MENSAGEM_DO_ERRO[erro.codigo] };
    }
    return { ok: false, erro: "Não foi possível testar a conexão agora." };
  }
}

/** Espaço do Drive para a tela, ou `null` se não há conta ou o Google não respondeu. */
export async function espacoDoDrive(): Promise<{
  usadoBytes: number;
  limiteBytes: number | null;
} | null> {
  if (!(await situacaoDaConexaoDrive())) return null;
  try {
    const { usadoBytes, limiteBytes } = await (await clienteDriveConectado()).espacoUsado();
    return { usadoBytes, limiteBytes };
  } catch {
    return null;
  }
}

/**
 * Desconecta: revoga o refresh token no Google e apaga a credencial (e o cache de pastas). Os
 * arquivos no Drive ficam. Se o Google não confirmar a revogação, a credencial é apagada mesmo
 * assim e `revogado` volta `false` (a gestão remove o acesso pela conta Google).
 *
 * Recusado (`ok: false`) enquanto houver qualquer original no Drive, inclusive de foto
 * excluída: sem a conta, ninguém mais baixaria esses arquivos.
 */
export async function desconectarDrive(): Promise<
  { ok: true; revogado: boolean } | { ok: false; fotosNoDrive: number }
> {
  const credencial = await lerCredencialDrive();
  if (!credencial) return { ok: true, revogado: true };
  const fotos = await fotosNoDrive();
  if (fotos > 0) return { ok: false, fotosNoDrive: fotos };
  let revogado = false;
  const refreshToken = decifrarSegredo(
    credencial.refreshTokenCifrado,
    FINALIDADE_REFRESH_TOKEN_DRIVE,
  );
  if (refreshToken) {
    try {
      await revogarToken(refreshToken);
      revogado = true;
    } catch (erro) {
      registrarFalha("revogação", erro);
    }
  }
  await apagarCredencialDrive();
  esquecerAcessoDrive();
  return { ok: true, revogado };
}
