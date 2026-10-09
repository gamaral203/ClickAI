import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from "node:crypto";

import { Secret, TOTP } from "otpauth";

import { derivarChave } from "./assinatura";

// Verificação em duas etapas por app autenticador (TOTP, RFC 6238: 6 dígitos a cada 30 s, o
// padrão do Google Authenticator, Authy, 1Password...). Aqui ficam só as contas: gerar e conferir
// o código, cifrar o segredo e gerar os códigos de recuperação. Quem pede o código e quando está
// em src/servicos/mfa.ts.
//
// O segredo fica no banco cifrado com AES-256-GCM, com uma chave derivada do APP_SECRET: quem
// ler o banco não gera códigos. Trocar o APP_SECRET torna os segredos ilegíveis (ver
// docs/seguranca.md, "Verificação em duas etapas").

const EMISSOR = "ClicouAí";
const DIGITOS = 6;
const PERIODO_S = 30;
/** Aceita o código do passo anterior e do seguinte (relógio do celular um pouco fora). */
const JANELA = 1;
const VERSAO_CIFRA = "v1";
const AAD = Buffer.from("clicouai:mfa-totp");

function totp(segredoBase32: string, rotulo = "conta") {
  return new TOTP({
    issuer: EMISSOR,
    label: rotulo,
    secret: Secret.fromBase32(segredoBase32),
    algorithm: "SHA1",
    digits: DIGITOS,
    period: PERIODO_S,
  });
}

/** Segredo novo (160 bits, o tamanho da RFC 4226), em base32. */
export function novoSegredoTotp(): string {
  return new Secret({ size: 20 }).base32;
}

/** Endereço otpauth:// que vai no QR Code para o app autenticador. */
export function enderecoDoTotp(segredoBase32: string, email: string): string {
  return totp(segredoBase32, email).toString();
}

/** Segredo em grupos de 4 letras, para digitar no app quando não dá para ler o QR Code. */
export function segredoParaDigitar(segredoBase32: string): string {
  return segredoBase32.replace(/(.{4})/g, "$1 ").trim();
}

/** Só os dígitos de um código digitado ("123 456" vira "123456"). */
export function normalizarCodigoTotp(texto: string): string | null {
  const digitos = texto.replace(/\s+/g, "");
  return /^\d{6}$/.test(digitos) ? digitos : null;
}

/**
 * Passo de 30 s do código, se ele confere com o segredo dentro da janela; senão `null`. O
 * passo serve para recusar o mesmo código duas vezes (src/dados/mfa.ts, consumirPassoMfa).
 */
export function passoDoCodigo(
  segredoBase32: string,
  codigo: string,
  agora = Date.now(),
): number | null {
  const token = normalizarCodigoTotp(codigo);
  if (!token) return null;
  const gerador = totp(segredoBase32);
  const delta = gerador.validate({ token, timestamp: agora, window: JANELA });
  if (delta === null) return null;
  return gerador.counter({ timestamp: agora }) + delta;
}

/** Código atual do segredo (só para testes e para conferir o cadastro). */
export function codigoAtual(segredoBase32: string, agora = Date.now()): string {
  return totp(segredoBase32).generate({ timestamp: agora });
}

// ---------------------------------------------------------------- Cifra do segredo

function chaveDaCifra() {
  return derivarChave("mfa-totp-segredo");
}

/** `v1.<iv>.<tag>.<cifrado>` em base64url. */
export function cifrarSegredo(segredoBase32: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDaCifra(), iv);
  cifra.setAAD(AAD);
  const cifrado = Buffer.concat([cifra.update(segredoBase32, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO_CIFRA, iv, tag, cifrado]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Segredo em base32, ou `null` se o texto foi alterado ou a chave mudou (APP_SECRET trocado). */
export function decifrarSegredo(texto: string): string | null {
  const [versao, iv, tag, cifrado, ...resto] = texto.split(".");
  if (versao !== VERSAO_CIFRA || !iv || !tag || !cifrado || resto.length > 0) return null;
  try {
    const decifra = createDecipheriv("aes-256-gcm", chaveDaCifra(), Buffer.from(iv, "base64url"));
    decifra.setAAD(AAD);
    decifra.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decifra.update(Buffer.from(cifrado, "base64url")),
      decifra.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Códigos de recuperação

/** Sem 0/o, 1/i/l: o código é lido de um papel e digitado. */
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
const TAMANHO_CODIGO = 10;
export const QUANTIDADE_CODIGOS = 10;

/** Códigos de recuperação novos, no formato `xxxxx-xxxxx` (~49 bits cada). */
export function gerarCodigosRecuperacao(quantidade = QUANTIDADE_CODIGOS): string[] {
  return Array.from({ length: quantidade }, () => {
    let codigo = "";
    for (let i = 0; i < TAMANHO_CODIGO; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  });
}

/** Código de recuperação sem espaços nem hífens, em minúsculas; `null` se não tem o formato. */
export function normalizarCodigoRecuperacao(texto: string): string | null {
  const limpo = texto.toLowerCase().replace(/[\s-]+/g, "");
  if (limpo.length !== TAMANHO_CODIGO) return null;
  for (const letra of limpo) if (!ALFABETO.includes(letra)) return null;
  return limpo;
}

/**
 * Hash do código de recuperação, para guardar e procurar no banco. HMAC com chave derivada do
 * APP_SECRET: sem o segredo, quem copiar o banco não testa códigos por força bruta.
 */
export function hashCodigoRecuperacao(texto: string): string | null {
  const codigo = normalizarCodigoRecuperacao(texto);
  if (!codigo) return null;
  return createHmac("sha256", derivarChave("mfa-codigo-recuperacao")).update(codigo).digest("hex");
}
