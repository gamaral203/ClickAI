import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

// Visitante sem conta no chat de ajuda do site: um cookie aleatório (httpOnly, 1 ano) diz qual é
// a conversa dele neste navegador. No banco fica só o hash (SHA-256), como nos tokens de pedido:
// quem lê o banco não consegue se passar pelo visitante.

const COOKIE = "clicouai_suporte";
const FORMATO = /^[A-Za-z0-9_-]{43}$/;
const UM_ANO_S = 365 * 24 * 60 * 60;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Identificador do visitante (o hash do cookie). Sem cookie, devolve `null`; com `criar`, cria o
 * cookie (só em ação do servidor ou rota, onde o Next deixa gravar cookie).
 */
export async function visitanteDoChat(criar: boolean): Promise<string | null> {
  const jarra = await cookies();
  const atual = jarra.get(COOKIE)?.value;
  if (atual && FORMATO.test(atual)) return hash(atual);
  if (!criar) return null;
  const token = randomBytes(32).toString("base64url");
  jarra.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UM_ANO_S,
  });
  return hash(token);
}
