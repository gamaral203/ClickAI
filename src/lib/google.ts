// Login com o Google (OAuth 2.0 / OpenID Connect, fluxo de código com PKCE). Só roda no
// servidor: o client secret nunca vai para o navegador.
//
// Configurar em https://console.cloud.google.com/apis/credentials > Criar credenciais > ID do
// cliente OAuth (aplicativo da Web), com o URI de redirecionamento autorizado
// {APP_URL}/api/auth/google/callback.

import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

const AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const USUARIO = "https://openidconnect.googleapis.com/v1/userinfo";

/** Cookie com o desafio do login (state + PKCE). Vive só os 10 minutos do vai e volta. */
export const COOKIE_GOOGLE = "clicouai_google";

type ConfigGoogle = { clientId: string; clientSecret: string; appUrl: string };

/** Configuração lida do ambiente, ou `null` sem credenciais (aí o botão do Google não aparece). */
export function configGoogle(): ConfigGoogle | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  return { clientId, clientSecret, appUrl: appUrl.replace(/\/$/, "") };
}

export function googleConfigurado() {
  return configGoogle() !== null;
}

/**
 * O endereço de volta vem do APP_URL configurado, nunca do cabeçalho Host da requisição, para
 * ninguém conseguir trocar o domínio para onde o Google devolve o código.
 */
function redirectUri(config: ConfigGoogle) {
  return `${config.appUrl}/api/auth/google/callback`;
}

function aleatorio() {
  return randomBytes(32).toString("base64url");
}

/** Valores de uso único do login, guardados num cookie curto até o Google devolver. */
export type DesafioGoogle = { state: string; verificador: string };

/** Monta o endereço de login do Google e o desafio que precisa voltar igual. */
export function iniciarLoginGoogle(): { url: string; desafio: DesafioGoogle } {
  const config = configGoogle();
  if (!config) throw new Error("Login com Google não configurado");
  const desafio = { state: aleatorio(), verificador: aleatorio() };
  const codeChallenge = createHash("sha256").update(desafio.verificador).digest("base64url");
  const url = new URL(AUTORIZACAO);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(config),
    response_type: "code",
    scope: "openid email profile",
    state: desafio.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), desafio };
}

const respostaToken = z.object({ access_token: z.string() });
const perfil = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
});

export type PerfilGoogle = { googleId: string; email: string; nome: string };

/**
 * Troca o código pelo token e lê o perfil direto no Google (o servidor fala com o Google por
 * HTTPS, então não precisa validar a assinatura do id_token). Só aceita e-mail verificado.
 */
export async function concluirLoginGoogle(
  codigo: string,
  verificador: string,
): Promise<PerfilGoogle | null> {
  const config = configGoogle();
  if (!config) return null;

  const token = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(config),
      grant_type: "authorization_code",
      code_verifier: verificador,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!token.ok) return null;
  const { access_token } = respostaToken.parse(await token.json());

  const resposta = await fetch(USUARIO, {
    headers: { Authorization: `Bearer ${access_token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!resposta.ok) return null;
  const dados = perfil.safeParse(await resposta.json());
  if (!dados.success || !dados.data.email_verified) return null;
  return {
    googleId: dados.data.sub,
    email: dados.data.email.toLowerCase(),
    nome: dados.data.name?.trim() || dados.data.email.split("@")[0],
  };
}

/** E-mails que entram como gestores (admin), separados por vírgula em ADMIN_EMAILS. */
export function emailEhGestor(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
