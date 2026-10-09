import "server-only";

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// Assinatura de dados que o servidor entrega ao navegador e depois recebe de volta, para
// conferir que não foram alterados (ex.: as fotos que a busca encontrou, que dão direito ao
// pacote). Chave em APP_SECRET; sem ela, em desenvolvimento, uma chave aleatória por processo
// (os tokens deixam de valer ao reiniciar o servidor).

const global = globalThis as typeof globalThis & { __clicouaiSegredo?: Buffer };

function segredo(): Buffer {
  const configurado = process.env.APP_SECRET;
  if (configurado && configurado.length >= 32) return Buffer.from(configurado);
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET ausente ou com menos de 32 caracteres");
  }
  global.__clicouaiSegredo ??= randomBytes(32);
  return global.__clicouaiSegredo;
}

/**
 * Chave de 32 bytes derivada do APP_SECRET (HKDF-SHA256) para um uso só (ex.: cifrar o segredo
 * da verificação em duas etapas). O `proposito` separa as chaves: uma não serve para a outra.
 */
export function derivarChave(proposito: string): Buffer {
  return Buffer.from(hkdfSync("sha256", segredo(), "clicouai", proposito, 32));
}

function hmac(proposito: string, corpo: string) {
  return createHmac("sha256", segredo()).update(`${proposito}.${corpo}`).digest("base64url");
}

/**
 * Token `corpo.assinatura` com os dados e a validade. O `proposito` entra na assinatura: um
 * token feito para uma coisa não vale para outra.
 */
export function assinar(proposito: string, dados: unknown, validadeMs: number) {
  const corpo = Buffer.from(JSON.stringify({ d: dados, x: Date.now() + validadeMs })).toString(
    "base64url",
  );
  return `${corpo}.${hmac(proposito, corpo)}`;
}

/** Dados do token, se a assinatura confere e ainda está no prazo; senão `null`. */
export function conferirAssinatura(proposito: string, token: string): unknown {
  const [corpo, assinatura, ...resto] = token.split(".");
  if (!corpo || !assinatura || resto.length > 0) return null;
  const esperada = Buffer.from(hmac(proposito, corpo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const { d, x } = JSON.parse(Buffer.from(corpo, "base64url").toString()) as {
      d: unknown;
      x: number;
    };
    return typeof x === "number" && x > Date.now() ? d : null;
  } catch {
    return null;
  }
}
