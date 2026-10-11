import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { derivarChave } from "./assinatura";

// Código de 6 dígitos guardado de forma recuperável só enquanto vale (src/servicos/
// confirmacao-email.ts e src/servicos/codigo-login.ts). Para "Reenviar código" mandar o MESMO
// código, o servidor precisa dele em claro; por isso, além do HMAC (que confere o que a pessoa
// digita), a linha guarda o código cifrado com AES-256-GCM, com chave derivada do APP_SECRET
// (HKDF, propósito próprio) e o dono (e-mail ou usuário) como dado autenticado: o texto de uma
// linha não decifra em outra. Quem lê só o banco não tem a chave. O cifrado some junto com a
// linha (código usado) ou é apagado quando o código vence ou esgota as tentativas.

const VERSAO = "v1";

function chave() {
  return derivarChave("codigo-verificacao-reenvio");
}

function aad(finalidade: string, dono: string) {
  return Buffer.from(`clicouai:${finalidade}:${dono.trim().toLowerCase()}`);
}

/** `v1.<iv>.<tag>.<cifrado>` em base64url. */
export function cifrarCodigo(codigo: string, finalidade: string, dono: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(), iv);
  cifra.setAAD(aad(finalidade, dono));
  const cifrado = Buffer.concat([cifra.update(codigo, "utf8"), cifra.final()]);
  return [
    VERSAO,
    iv.toString("base64url"),
    cifra.getAuthTag().toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

/** O código, ou `null` se o texto foi alterado, é de outro dono ou a chave mudou. */
export function decifrarCodigo(
  texto: string | null | undefined,
  finalidade: string,
  dono: string,
): string | null {
  if (!texto) return null;
  const [versao, iv, tag, cifrado, ...resto] = texto.split(".");
  if (versao !== VERSAO || !iv || !tag || !cifrado || resto.length > 0) return null;
  try {
    const decifra = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
    decifra.setAAD(aad(finalidade, dono));
    decifra.setAuthTag(Buffer.from(tag, "base64url"));
    const codigo = Buffer.concat([
      decifra.update(Buffer.from(cifrado, "base64url")),
      decifra.final(),
    ]).toString("utf8");
    return /^\d{6}$/.test(codigo) ? codigo : null;
  } catch {
    return null;
  }
}
