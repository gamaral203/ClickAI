import "server-only";

import { createHash, randomBytes } from "node:crypto";

// Acesso à galeria de evento com senha. Quem acerta a senha ganha um cookie HttpOnly com um
// token aleatório, um por evento; no servidor fica só o hash do token, como na sessão.

/** Por quanto tempo a senha vale no mesmo navegador. */
export const DURACAO_ACESSO_EVENTO_MS = 7 * 24 * 60 * 60 * 1000;

export function cookieDoEvento(eventoId: string) {
  return `clicouai_evento_${eventoId}`;
}

export function novoTokenDeAcesso() {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
