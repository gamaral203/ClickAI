import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  apagarCodigoDeAcao,
  buscarCodigoDeAcao,
  contarTentativaDoCodigoDeAcao,
  gravarCodigoDeAcao,
} from "@/dados/codigos-de-acao";
import type { Usuario } from "@/dados/tipos";
import { derivarChave } from "@/lib/assinatura";

import { verificacaoPorEmailAtiva } from "./codigo-login";
import { gerarCodigo } from "./confirmacao-email";
import { limiteAtingido } from "./limites";
import { enviarCodigoDeAcaoPorEmail } from "./mensagens";

// Código de confirmação por e-mail das ações sensíveis (docs/seguranca.md, item 3). Substituiu o
// código do app autenticador (decisão de 16/10/2026: a equipe quer o código no e-mail):
//   - SEMPRE, para todos: saque (transferência manual), ligar a transferência automática e trocar
//     o CPF/CNPJ (que define a chave Pix). Quem roubou só a senha não tira dinheiro da conta;
//   - só com a verificação em duas etapas ligada: troca de senha e download dos originais;
//   - ligar e desligar a própria verificação em duas etapas (prova que a pessoa lê o e-mail).
// A tela pede o código ("Enviar código") e o formulário manda o número com a ação. Um código por
// finalidade, 6 dígitos, vale 10 minutos e uma vez só, 5 tentativas; outro envio em menos de 30
// segundos não sai; os envios contam no limite `codigo_acao_envio_usuario`.

export const FINALIDADES_DE_CODIGO = [
  "saque",
  "transferencia",
  "documento",
  "senha",
  "originais",
  "gestao_originais",
  "verificacao",
] as const;
export type FinalidadeDoCodigo = (typeof FINALIDADES_DE_CODIGO)[number];

/** O que a pessoa está confirmando, no e-mail ("…para {texto}"). */
const TEXTO_DA_FINALIDADE: Record<FinalidadeDoCodigo, string> = {
  saque: "transferir o seu saldo",
  transferencia: "ligar a transferência automática do saldo",
  documento: "trocar o CPF/CNPJ (a chave Pix dos saques)",
  senha: "trocar a sua senha",
  originais: "baixar os originais das suas fotos",
  gestao_originais: "baixar originais de fotos pela gestão do ClicouAí",
  verificacao: "mudar a verificação em duas etapas da sua conta",
};

/** Pedem o código mesmo com a verificação em duas etapas desligada. */
const SEMPRE: ReadonlySet<FinalidadeDoCodigo> = new Set([
  "saque",
  "transferencia",
  "documento",
  "verificacao",
]);

export const VALIDADE_CODIGO_ACAO_MS = 10 * 60 * 1000;
export const ESPERA_REENVIO_CODIGO_ACAO_MS = 30 * 1000;
export const MAXIMO_TENTATIVAS_CODIGO_ACAO = 5;

export function ehFinalidadeDeCodigo(valor: unknown): valor is FinalidadeDoCodigo {
  return typeof valor === "string" && (FINALIDADES_DE_CODIGO as readonly string[]).includes(valor);
}

/** A ação pede o código por e-mail para este usuário? */
export function pedeCodigoDeAcao(
  usuario: Pick<Usuario, "mfaAtivo">,
  finalidade: FinalidadeDoCodigo,
): boolean {
  // Na produção sem o Resend não há como mandar o código: a ação segue sem ele (com aviso no log)
  // para ninguém ficar sem conseguir sacar. Fora da produção, o código vai para o log.
  if (!verificacaoPorEmailAtiva()) return false;
  return SEMPRE.has(finalidade) || usuario.mfaAtivo;
}

function hashDoCodigo(usuarioId: string, finalidade: string, codigo: string) {
  return createHmac("sha256", derivarChave("codigo-de-acao"))
    .update(`${usuarioId}:${finalidade}:${codigo}`)
    .digest("hex");
}

function mesmoHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type ResultadoEnvioCodigoAcao =
  { ok: true; expiraEm: number } | { ok: false; motivo: "espera" | "limite" | "indisponivel" };

/** Gera e manda por e-mail um código novo para a finalidade (o anterior deixa de valer). */
export async function enviarCodigoDeAcao(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  finalidade: FinalidadeDoCodigo,
  agora = Date.now(),
): Promise<ResultadoEnvioCodigoAcao> {
  const atual = await buscarCodigoDeAcao(usuario.id, finalidade);
  if (atual && atual.enviadoEm + ESPERA_REENVIO_CODIGO_ACAO_MS > agora) {
    return { ok: false, motivo: "espera" };
  }
  if (await limiteAtingido("codigo_acao_envio_usuario", usuario.id)) {
    return { ok: false, motivo: "limite" };
  }
  const codigo = gerarCodigo();
  const expiraEm = agora + VALIDADE_CODIGO_ACAO_MS;
  await gravarCodigoDeAcao({
    usuarioId: usuario.id,
    finalidade,
    codigoHash: hashDoCodigo(usuario.id, finalidade, codigo),
    expiraEm,
    agora,
  });
  const enviou = await enviarCodigoDeAcaoPorEmail(
    usuario.email,
    usuario.nome,
    codigo,
    expiraEm,
    TEXTO_DA_FINALIDADE[finalidade],
  );
  return enviou ? { ok: true, expiraEm } : { ok: false, motivo: "indisponivel" };
}

export type ResultadoCodigoAcao = "ok" | "faltando" | "invalido" | "vencido" | "bloqueado";

/** Confere o código (uma vez só). */
export async function conferirCodigoDeAcao(
  usuarioId: string,
  finalidade: FinalidadeDoCodigo,
  texto: unknown,
  agora = Date.now(),
): Promise<ResultadoCodigoAcao> {
  const digitos = typeof texto === "string" ? texto.replace(/\D/g, "") : "";
  if (!digitos) return "faltando";
  const linha = await contarTentativaDoCodigoDeAcao(usuarioId, finalidade);
  if (!linha || linha.expiraEm <= agora) return "vencido";
  if (linha.tentativas > MAXIMO_TENTATIVAS_CODIGO_ACAO) return "bloqueado";
  if (!mesmoHash(linha.codigoHash, hashDoCodigo(usuarioId, finalidade, digitos))) {
    return "invalido";
  }
  return (await apagarCodigoDeAcao(usuarioId, finalidade, linha.codigoHash)) ? "ok" : "vencido";
}

/**
 * Para as ações: passa direto se esta finalidade não pede código para o usuário; senão, confere
 * o código digitado.
 */
export async function exigirCodigoDeAcao(
  usuario: Pick<Usuario, "id" | "mfaAtivo">,
  finalidade: FinalidadeDoCodigo,
  texto: unknown,
): Promise<ResultadoCodigoAcao> {
  if (!pedeCodigoDeAcao(usuario, finalidade)) return "ok";
  return conferirCodigoDeAcao(usuario.id, finalidade, texto);
}

export const MENSAGENS_CODIGO_ACAO: Record<Exclude<ResultadoCodigoAcao, "ok">, string> = {
  faltando: "Clique em “Enviar código” e digite o código que chegou no seu e-mail.",
  invalido: "Código incorreto. Confira o e-mail e tente de novo.",
  vencido: "O código venceu ou já foi usado. Peça um novo em “Enviar código”.",
  bloqueado: "Muitas tentativas com este código. Peça um novo em “Enviar código”.",
};
