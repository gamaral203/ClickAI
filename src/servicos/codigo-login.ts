import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  buscarCodigoDeLogin,
  consumirCodigoDeLogin,
  contarTentativaDoCodigoDeLogin,
  gravarCodigoDeLogin,
  liberarReenvioDoCodigoDeLogin,
  renovarCodigoDeLogin,
  trocarCodigoDeLogin,
  type CodigoDeLogin,
  type Usuario,
} from "@/dados";
import { emProducao } from "@/db/conexao";
import { derivarChave } from "@/lib/assinatura";
import { cifrarCodigo, decifrarCodigo } from "@/lib/codigo-cifrado";
import { emailConfigurado } from "@/lib/email";

import { gerarCodigo, TAMANHO_CODIGO } from "./confirmacao-email";
import { limiteAtingido, limiteDoIpAtingido } from "./limites";
import { enviarCodigoDeAcessoDoGestor } from "./mensagens";

// Código de acesso do gestor (docs/arquitetura.md, "Login e papéis"). Todo gestor (papel `admin`),
// ao acertar a senha ou voltar do Google, recebe no e-mail da conta um código de 6 dígitos; a
// sessão só abre em /entrar/codigo, com esse código (ou com o do app autenticador, se a
// verificação em duas etapas estiver ligada). Quem roubou só a senha do gestor não entra.
//
// Regras: um código por vez (`codigos_de_login`, um por usuário). Enquanto o código vale (não
// usado, não vencido, com tentativas sobrando, no máximo 2 horas desde que foi gerado), um login
// novo ou "Reenviar código" mandam o MESMO código: todo e-mail que chegar traz o mesmo número. O
// login novo passa a ser o único que aceita o código. A conferência é pelo HMAC; o código fica
// cifrado na linha (src/lib/codigo-cifrado.ts) só enquanto vale, para poder ser reenviado. Vale 10
// minutos a cada envio e uma vez só; aceita 5 tentativas (o reenvio não zera) e depois só um
// código novo serve; cada login pede no máximo 3 reenvios; outro envio em menos de 30 segundos não
// sai (clique duplo); os envios contam nos limites `codigo_login_envio_usuario` e
// `codigo_login_envio_ip`.
//
// Sem o Resend: fora da produção, o código vai para o log do servidor (como o do cadastro) e a
// etapa continua obrigatória; na produção, a etapa fica desligada para não trancar a equipe fora
// da gestão (o login avisa no log e /admin mostra um aviso até o Resend ser configurado).

export const VALIDADE_CODIGO_LOGIN_MS = 10 * 60 * 1000;
/** Teto absoluto da validade de um código, mesmo com reenvios e logins novos. */
export const TETO_CODIGO_LOGIN_MS = 2 * 60 * 60 * 1000;
/** Outro envio antes disso não sai (o mesmo código acabou de ser mandado). */
export const ESPERA_REENVIO_CODIGO_LOGIN_MS = 30 * 1000;
export const MAXIMO_TENTATIVAS_CODIGO_LOGIN = 5;
export const MAXIMO_REENVIOS_CODIGO_LOGIN = 3;

const FINALIDADE = "codigo-login-gestor";

/**
 * O login deste usuário pede o código por e-mail? O do gestor, sempre; o de quem ligou a
 * verificação em duas etapas (desde 16/10/2026 por e-mail, no lugar do app autenticador).
 */
export function exigeCodigoPorEmail(usuario: Pick<Usuario, "papel" | "mfaAtivo">): boolean {
  return usuario.papel === "admin" || usuario.mfaAtivo;
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
  | {
      ok: true;
      /** `true`: o mesmo código que já valia; `false`: código novo. */
      mesmo: boolean;
      /** `false`: o mesmo código tinha acabado de sair (menos de 30 s); nenhum e-mail novo. */
      enviou: boolean;
      enviadoEm: number;
      expiraEm: number;
    }
  | { ok: false; motivo: "espera"; segundos: number }
  | { ok: false; motivo: "limite" | "reenvios" | "indisponivel" | "sem_login" };

async function envioBloqueado(usuarioId: string) {
  const [porUsuario, porIp] = await Promise.all([
    limiteAtingido("codigo_login_envio_usuario", usuarioId),
    limiteDoIpAtingido("codigo_login_envio_ip"),
  ]);
  return porUsuario || porIp;
}

/**
 * O código desta linha ainda pode ser mandado de novo? Não vencido, com tentativas sobrando,
 * dentro do teto e com o cifrado legível e conferindo com o HMAC. Devolve o código (só em
 * memória) e quando foi gerado.
 */
function codigoReaproveitavel(
  linha: CodigoDeLogin,
  agora: number,
): { codigo: string; geradoEm: number } | null {
  if (linha.tentativas >= MAXIMO_TENTATIVAS_CODIGO_LOGIN) return null;
  if (linha.expiraEm <= agora) return null;
  if (linha.codigoGeradoEm === null || linha.codigoGeradoEm + TETO_CODIGO_LOGIN_MS <= agora) {
    return null;
  }
  const codigo = decifrarCodigo(linha.codigoCifrado, FINALIDADE, linha.usuarioId);
  if (
    !codigo ||
    !mesmoHash(linha.codigoHash, hashDoCodigoDeLogin(linha.usuarioId, linha.loginId, codigo))
  ) {
    return null;
  }
  return { codigo, geradoEm: linha.codigoGeradoEm };
}

function validade(geradoEm: number, agora: number) {
  return Math.min(agora + VALIDADE_CODIGO_LOGIN_MS, geradoEm + TETO_CODIGO_LOGIN_MS);
}

async function mandar(
  usuario: Pick<Usuario, "id" | "email" | "nome"> & { papel?: Usuario["papel"] },
  loginId: string,
  codigo: string,
  dados: { mesmo: boolean; agora: number; expiraEm: number },
): Promise<ResultadoEnvioCodigoLogin> {
  const gestor = usuario.papel === undefined || usuario.papel === "admin";
  if (
    await enviarCodigoDeAcessoDoGestor(usuario.email, usuario.nome, codigo, dados.expiraEm, gestor)
  ) {
    return {
      ok: true,
      mesmo: dados.mesmo,
      enviou: true,
      enviadoEm: dados.agora,
      expiraEm: dados.expiraEm,
    };
  }
  // Não saiu: o reenvio fica liberado na hora.
  await liberarReenvioDoCodigoDeLogin(usuario.id, loginId);
  return { ok: false, motivo: "indisponivel" };
}

/**
 * Código de um login novo (a senha ou o Google já conferiram). Se o código do login anterior
 * ainda vale, é o MESMO que segue para este login (o anterior deixa de aceitá-lo) e vai de novo
 * por e-mail; se ele saiu há menos de 30 segundos (dois logins seguidos), nenhum e-mail novo sai.
 * Senão, gera um código novo.
 */
export async function enviarCodigoDeLogin(
  usuario: Pick<Usuario, "id" | "email" | "nome">,
  loginId: string,
  agora = Date.now(),
): Promise<ResultadoEnvioCodigoLogin> {
  // Duas voltas: se outro login mexeu na linha entre a leitura e a gravação, lê de novo.
  for (let volta = 0; volta < 2; volta++) {
    const linha = await buscarCodigoDeLogin(usuario.id);
    const mesmo = linha ? codigoReaproveitavel(linha, agora) : null;
    if (!linha || !mesmo) break;
    const recente = linha.enviadoEm + ESPERA_REENVIO_CODIGO_LOGIN_MS > agora;
    // Sem cota de envio, o código ainda passa a este login: o e-mail que já chegou serve.
    const bloqueado = !recente && (await envioBloqueado(usuario.id));
    const enviar = !recente && !bloqueado;
    const expiraEm = validade(mesmo.geradoEm, agora);
    const renovou = await renovarCodigoDeLogin({
      usuarioId: usuario.id,
      loginIdAnterior: linha.loginId,
      codigoHashAnterior: linha.codigoHash,
      loginId,
      codigoHash: hashDoCodigoDeLogin(usuario.id, loginId, mesmo.codigo),
      expiraEm,
      agora,
      maximoTentativas: MAXIMO_TENTATIVAS_CODIGO_LOGIN,
      enviar,
    });
    if (!renovou) continue;
    if (bloqueado) return { ok: false, motivo: "limite" };
    if (!enviar) {
      return { ok: true, mesmo: true, enviou: false, enviadoEm: linha.enviadoEm, expiraEm };
    }
    return mandar(usuario, loginId, mesmo.codigo, { mesmo: true, agora, expiraEm });
  }

  if (await envioBloqueado(usuario.id)) return { ok: false, motivo: "limite" };
  const codigo = gerarCodigo();
  const expiraEm = agora + VALIDADE_CODIGO_LOGIN_MS;
  await gravarCodigoDeLogin({
    usuarioId: usuario.id,
    loginId,
    codigoHash: hashDoCodigoDeLogin(usuario.id, loginId, codigo),
    codigoCifrado: cifrarCodigo(codigo, FINALIDADE, usuario.id),
    expiraEm,
    agora,
    reenvios: 0,
  });
  return mandar(usuario, loginId, codigo, { mesmo: false, agora, expiraEm });
}

/** Segundos que faltam para poder pedir outro envio neste login (0: já pode). */
export async function segundosParaReenviarCodigoDeLogin(
  usuarioId: string,
  loginId: string,
  agora = Date.now(),
): Promise<number> {
  const linha = await buscarCodigoDeLogin(usuarioId);
  if (!linha || linha.loginId !== loginId) return 0;
  return Math.max(0, Math.ceil((linha.enviadoEm + ESPERA_REENVIO_CODIGO_LOGIN_MS - agora) / 1000));
}

/** Hora do último envio e validade do código deste login (para a tela), ou `null`. */
export async function situacaoDoCodigoDeLogin(
  usuarioId: string,
  loginId: string,
): Promise<{ enviadoEm: number; expiraEm: number } | null> {
  const linha = await buscarCodigoDeLogin(usuarioId);
  if (!linha || linha.loginId !== loginId || linha.enviadoEm <= 0) return null;
  return { enviadoEm: linha.enviadoEm, expiraEm: linha.expiraEm };
}

/**
 * "Reenviar código": manda o MESMO código de novo enquanto ele vale (renova os 10 minutos, até o
 * teto de 2 horas); vencido ou sem tentativas, gera um novo. Espera 30 segundos desde o último
 * envio e aceita no máximo 3 reenvios por login. Se outro login do mesmo usuário começou depois,
 * este já não vale.
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
  const espera = {
    ok: false,
    motivo: "espera",
    segundos: ESPERA_REENVIO_CODIGO_LOGIN_MS / 1000,
  } as const;
  const reenvio = {
    esperaMs: ESPERA_REENVIO_CODIGO_LOGIN_MS,
    maximoReenvios: MAXIMO_REENVIOS_CODIGO_LOGIN,
  };

  const mesmo = linha ? codigoReaproveitavel(linha, agora) : null;
  if (linha && mesmo) {
    const expiraEm = validade(mesmo.geradoEm, agora);
    const renovou = await renovarCodigoDeLogin({
      usuarioId: usuario.id,
      loginIdAnterior: loginId,
      codigoHashAnterior: linha.codigoHash,
      loginId,
      codigoHash: linha.codigoHash,
      expiraEm,
      agora,
      maximoTentativas: MAXIMO_TENTATIVAS_CODIGO_LOGIN,
      enviar: true,
      reenvio,
    });
    // Outro reenvio ao mesmo tempo (clique duplo) já mandou o mesmo código.
    if (!renovou) return espera;
    return mandar(usuario, loginId, mesmo.codigo, { mesmo: true, agora, expiraEm });
  }

  const codigo = gerarCodigo();
  const expiraEm = agora + VALIDADE_CODIGO_LOGIN_MS;
  const dados = {
    usuarioId: usuario.id,
    loginId,
    codigoHash: hashDoCodigoDeLogin(usuario.id, loginId, codigo),
    codigoCifrado: cifrarCodigo(codigo, FINALIDADE, usuario.id),
    expiraEm,
    agora,
  };
  if (linha) {
    const trocou = await trocarCodigoDeLogin({ ...dados, ...reenvio });
    // Outro reenvio ao mesmo tempo (clique duplo) trocou e mandou o código.
    if (!trocou) return espera;
  } else {
    // O primeiro código não chegou a ser gravado (limite atingido no login): este é o primeiro
    // reenvio.
    await gravarCodigoDeLogin({ ...dados, reenvios: 1 });
  }
  return mandar(usuario, loginId, codigo, { mesmo: false, agora, expiraEm });
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
