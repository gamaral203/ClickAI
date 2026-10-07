import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Hash de senha com scrypt e salt aleatório. Só para a sessão simulada da Parte A: na Fase 11
// o Better Auth assume senhas e sessões.

const TAMANHO_CHAVE = 64;

export function gerarHashSenha(senha: string) {
  const sal = randomBytes(16);
  const chave = scryptSync(senha, sal, TAMANHO_CHAVE);
  return `scrypt$${sal.toString("base64")}$${chave.toString("base64")}`;
}

export function senhaConfere(senha: string, armazenado: string) {
  const [algoritmo, sal, chave] = armazenado.split("$");
  if (algoritmo !== "scrypt" || !sal || !chave) return false;
  const esperado = Buffer.from(chave, "base64");
  const calculado = scryptSync(senha, Buffer.from(sal, "base64"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

/**
 * Hash de uma senha qualquer, para comparar quando o e-mail não existe e o login levar o
 * mesmo tempo nos dois casos (não revela quem tem conta).
 */
export const HASH_FALSO = gerarHashSenha(randomBytes(16).toString("hex"));
