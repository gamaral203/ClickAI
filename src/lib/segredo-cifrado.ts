import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { derivarChave } from "./assinatura";

// Segredo de terceiros guardado no banco de forma recuperável (ex.: o refresh token do Google
// Drive, src/dados/configuracoes.ts). AES-256-GCM com chave derivada do APP_SECRET (HKDF, uma
// chave por finalidade: "segredo:" + finalidade) e a própria finalidade como dado autenticado:
// o texto cifrado para uma coisa não decifra como outra. Quem lê só o banco não tem a chave.
// Trocar o APP_SECRET invalida os segredos guardados (é preciso conectar a conta de novo).

const VERSAO = "v1";

function chave(finalidade: string) {
  return derivarChave(`segredo:${finalidade}`);
}

function aad(finalidade: string) {
  return Buffer.from(`clicouai:segredo:${finalidade}`);
}

/** `v1.<iv>.<tag>.<cifrado>` em base64url. */
export function cifrarSegredo(texto: string, finalidade: string): string {
  if (!finalidade) throw new Error("Finalidade do segredo ausente");
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(finalidade), iv);
  cifra.setAAD(aad(finalidade));
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return [
    VERSAO,
    iv.toString("base64url"),
    cifra.getAuthTag().toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

/**
 * O segredo em claro, ou `null` se o texto foi alterado, é de outra finalidade ou a chave mudou.
 * Nunca registre o retorno em log.
 */
export function decifrarSegredo(
  cifrado: string | null | undefined,
  finalidade: string,
): string | null {
  if (!cifrado || !finalidade) return null;
  const [versao, iv, tag, corpo, ...resto] = cifrado.split(".");
  if (versao !== VERSAO || !iv || !tag || !corpo || resto.length > 0) return null;
  try {
    const decifra = createDecipheriv(
      "aes-256-gcm",
      chave(finalidade),
      Buffer.from(iv, "base64url"),
    );
    decifra.setAAD(aad(finalidade));
    decifra.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decifra.update(Buffer.from(corpo, "base64url")),
      decifra.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
