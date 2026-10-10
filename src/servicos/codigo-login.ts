import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  buscarCodigoDeLogin,
  consumirCodigoDeLogin,
  contarTentativaDoCodigoDeLogin,
  gravarCodigoDeLogin,
  liberarReenvioDoCodigoDeLogin,
  trocarCodigoDeLogin,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { derivarChave } from "@/lib/assinatura";
import { emailConfigurado } from "@/lib/email";

import { gerarCodigo, TAMANHO_CODIGO } from "./confirmacao-email";
import { limiteAtingido, limiteDoIpAtingido } from "./limites";
import { enviarCodigoDeAcessoDoGestor } from "./mensagens";

// Código de acesso do gestor (docs/arquitetura.md, "Login e papéis"). Todo gestor (papel `admin`),
// ao acertar a senha ou voltar do Google, recebe no e-mail da conta um código de 6 dígitos; a
// sessão só abre em /entrar/codigo, com esse código (ou com o do app autenticador, se a
// verificação em duas etapas estiver ligada). Quem roubou só a senha do gestor não entra.
//
// Regras: só o HMAC do código fica no banco (`codigos_de_login`, um por usuário: um login novo
// troca o código); vale 10 minutos e uma vez só; cada código aceita 5 tentativas e depois só um
// código novo serve; cada login pendente pede no máximo 3 códigos novos, com 60 segundos entre
// eles; os envios contam nos limites `codigo_login_envio_usuario` e `codigo_login_envio_ip`.
//
// Sem o Resend: fora da produção, o código vai para o log do servidor (como o do cadastro) e a
// etapa continua obrigatória; na produção, a etapa fica desligada para não trancar a equipe fora
// da gestão (o login avisa no log e /admin mostra um aviso até o Resend ser configurado).

export const VALIDADE_CODIGO_LOGIN_MS = 10 * 60 * 1000;
export const ESPERA_REENVIO_CODIGO_LOGIN_MS = 60 * 1000;
export const MAXIMO_TENTATIVAS_CODIGO_LOGIN = 5;
export const MAXIMO_REENVIOS_CODIGO_LOGIN = 3;

/** O login deste usuário pede o código por e-mail? Só o do gestor. */
export function exigeCodigoPorEmail(usuario: Pick<Usuario, "papel">): boolean {
  return usuario.papel === "admin";
}

/**
 * A etapa do e-mail está valendo? Com o Resend configurado, sim; fora da produção também (o
 * código vai para o log). Na produção sem o Resend, não: o gestor entra só com a senha (e o app
 * autenticador, se ligado), para a equipe não ficar trancada fora da gestão. Lê as variáveis a
 * cada chamada.
 */
export function verificacaoPorEmailAtiva(): boolean {
  return emailConfigurado() || !emProducao();
}

/** HMAC do código, ligado ao usuário e ao login pendente (chave derivada do APP_SECRET). */
export function hashDoCodigoDeLogin(usuarioId: string, loginId: string, codigo: string): string {
  return createHmac("sha256", derivarChave("codigo-login-gestor"))
    .update(`${usuarioId}:${loginId}:${codigo}`)
    .digest("hex");
}

function mesmoHash(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type ResultadoEnvioCodigoLogin =
  | { ok: true }
  | { ok: false; motivo: "espera"; segundos: number }
  | { ok: false; motivo: "limite" | "reenvios" | "indisponivel" | "sem_login" };

async function envioBloqueado(usuarioId: string) {
  const [porUsuario, porIp] = await Promise.all([
    limiteAtingido("codigo_login_envio_usuario", usuarioId),
    limiteDoIpAtingido("codigo_login_envio_ip"),
  ]);
  return porUsuario || porIp;
}

async function mandar(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  loginId: string,
  codigo: string,
): Promise<ResultadoEnvioCodigoLogin> {
  if (await enviarCodigoDeAcessoDoGestor(usuario.email, usuario.nome, codigo)) return { ok: true };
  // Não saiu: o reenvio fica liberado na hora.
  await liberarReenvioDoCodigoDeLogin(usuario.id, loginId);
  return { ok: false, motivo: "indisponivel" };
}

/** Primeiro código de um login novo (a senha ou o Google já conferiram). */
export async function enviarCodigoDeLogin(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  loginId: string,
  agora = Date.now(),
): Promise<ResultadoEnvioCodigoLogin> {
  if (await envioBloqueado(usuario.id)) return { ok: false, motivo: "limite" };
  const codigo = gerarCodigo();
  await gravarCodigoDeLogin({
    usuarioId: usuario.id,
    loginId,
    codigoHash: hashDoCodigoDeLogin(usuario.id, loginId, codigo),
    expiraEm: agora + VALIDADE_CODIGO_LOGIN_MS,
    agora,
    reenvios: 0,
  });
  return mandar(usuario, loginId, codigo);
}

/** Segundos que faltam para poder pedir outro código neste login (0: já pode). */
export async function segundosParaReenviarCodigoDeLogin(
  usuarioId: string,
  loginId: string,
  agora = Date.now(),
): Promise<number> {
  const linha = await buscarCodigoDeLogin(usuarioId);
  if (!linha || linha.loginId !== loginId) return 0;
  return Math.max(0, Math.ceil((linha.enviadoEm + ESPERA_REENVIO_CODIGO_LOGIN_MS - agora) / 1000));
}

/**
 * "Reenviar código": gera um código novo para o mesmo login (o anterior deixa de valer). Espera
 * 60 segundos desde o último envio e aceita no máximo 3 reenvios por login. Se outro login do
 * mesmo usuário começou depois, este já não vale.
 */
export async function reenviarCodigoDeLogin(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  loginId: string,
  agora = Date.now(),
): Promise<ResultadoEnvioCodigoLogin> {
  const linha = await buscarCodigoDeLogin(usuario.id);
  if (linha && linha.loginId !== loginId) return { ok: false, motivo: "sem_login" };
  if (linha) {
    if (linha.reenvios >= MAXIMO_REENVIOS_CODIGO_LOGIN) return { ok: false, motivo: "reenvios" };
    const segundos = await segundosParaReenviarCodigoDeLogin(usuario.id, loginId, agora);
    if (segundos > 0) return { ok: false, motivo: "espera", segundos };
  }
  if (await envioBloqueado(usuario.id)) return { ok: false, motivo: "limite" };

  const codigo = gerarCodigo();
  const dados = {
    usuarioId: usuario.id,
    loginId,
    codigoHash: hashDoCodigoDeLogin(usuario.id, loginId, codigo),
    expiraEm: agora + VALIDADE_CODIGO_LOGIN_MS,
    agora,
  };
  if (linha) {
    const trocou = await trocarCodigoDeLogin({
      ...dados,
      esperaMs: ESPERA_REENVIO_CODIGO_LOGIN_MS,
      maximoReenvios: MAXIMO_REENVIOS_CODIGO_LOGIN,
    });
    // Outro reenvio ao mesmo tempo (clique duplo) trocou e mandou o código.
    if (!trocou) {
      return { ok: false, motivo: "espera", segundos: ESPERA_REENVIO_CODIGO_LOGIN_MS / 1000 };
    }
  } else {
    // O primeiro código não chegou a ser gravado (limite atingido no login): este é o primeiro
    // reenvio.
    await gravarCodigoDeLogin({ ...dados, reenvios: 1 });
  }
  return mandar(usuario, loginId, codigo);
}

export type ResultadoConferenciaCodigoLogin =
  | { ok: true }
  | { ok: false; motivo: "invalido"; restantes: number }
  | { ok: false; motivo: "bloqueado" | "expirado" | "sem_codigo" };

/**
 * Confere o código do e-mail. Conta a tentativa antes de comparar (em tempo constante); na quinta
 * errada, o código deixa de valer. Certo, apaga a linha: o código não vale duas vezes.
 */
export async function conferirCodigoDeLogin(
  usuarioId: string,
  loginId: string,
  codigo: string,
  agora = Date.now(),
): Promise<ResultadoConferenciaCodigoLogin> {
  const linha = await buscarCodigoDeLogin(usuarioId);
  if (!linha || linha.loginId !== loginId) return { ok: false, motivo: "sem_codigo" };
  if (linha.tentativas >= MAXIMO_TENTATIVAS_CODIGO_LOGIN) return { ok: false, motivo: "bloqueado" };
  if (linha.expiraEm <= agora) return { ok: false, motivo: "expirado" };

  const tentativa = await contarTentativaDoCodigoDeLogin(
    usuarioId,
    loginId,
    MAXIMO_TENTATIVAS_CODIGO_LOGIN,
  );
  if (!tentativa) return { ok: false, motivo: "bloqueado" };
  const digitado = codigo.replace(/\D/g, "");
  if (
    digitado.length !== TAMANHO_CODIGO ||
    !mesmoHash(tentativa.codigoHash, hashDoCodigoDeLogin(usuarioId, loginId, digitado))
  ) {
    const restantes = MAXIMO_TENTATIVAS_CODIGO_LOGIN - tentativa.tentativas;
    return restantes > 0
      ? { ok: false, motivo: "invalido", restantes }
      : { ok: false, motivo: "bloqueado" };
  }
  // Uso único: só quem apagar a linha com este código segue (dois envios ao mesmo tempo, ou um
  // reenvio no meio, não abrem duas sessões).
  if (!(await consumirCodigoDeLogin(usuarioId, loginId, tentativa.codigoHash))) {
    return { ok: false, motivo: "expirado" };
  }
  return { ok: true };
}
