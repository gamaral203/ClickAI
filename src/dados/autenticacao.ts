// Dados da confirmação do e-mail por código, do "Esqueci a senha" e do código de acesso do gestor
// (src/servicos/confirmacao-email.ts, src/servicos/redefinicao-senha.ts e
// src/servicos/codigo-login.ts). Código e token chegam aqui só como hash.

import "server-only";

import { and, eq, isNull, lt, lte, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import type { Papel } from "./tipos";

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------- Código de confirmação do e-mail

export type CadastroPendente = { nome: string; senhaHash: string; papel: Papel };

export type CodigoEmail = {
  email: string;
  /** Conta antiga, criada antes da confirmação obrigatória; `null` no cadastro pendente. */
  usuarioId: string | null;
  /** Dados do cadastro com senha que ainda espera o código; `null` na conta antiga. */
  cadastro: CadastroPendente | null;
  codigoHash: string;
  /** O código cifrado (src/lib/codigo-cifrado.ts), para reenviar o mesmo; `null` se não há. */
  codigoCifrado: string | null;
  /** Quando o código foi gerado (teto da validade); `null` nas linhas antigas. */
  codigoGeradoEm: number | null;
  codigoExpiraEm: number;
  tentativas: number;
  enviadoEm: number;
  criadoEm: number;
};

function paraCodigoEmail(r: typeof t.codigosEmail.$inferSelect): CodigoEmail {
  return {
    email: r.email,
    usuarioId: r.usuarioId,
    cadastro:
      r.usuarioId === null && r.nome !== null && r.senhaHash !== null && r.papel !== null
        ? { nome: r.nome, senhaHash: r.senhaHash, papel: r.papel }
        : null,
    codigoHash: r.codigoHash,
    codigoCifrado: r.codigoCifrado,
    codigoGeradoEm: r.codigoGeradoEm?.getTime() ?? null,
    codigoExpiraEm: r.codigoExpiraEm.getTime(),
    tentativas: r.tentativas,
    enviadoEm: r.enviadoEm.getTime(),
    criadoEm: r.criadoEm.getTime(),
  };
}

export async function buscarCodigoEmail(email: string): Promise<CodigoEmail | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.codigosEmail)
    .where(eq(t.codigosEmail.email, normalizarEmail(email)));
  return linha ? paraCodigoEmail(linha) : null;
}

/**
 * Grava um código novo para o e-mail (zera as tentativas), só se o último envio foi há pelo menos
 * `esperaMs`. Devolve se gravou: dois envios ao mesmo tempo (clique duplo) gravam um só, e só
 * quem gravou manda o e-mail. `renovar` (cadastro refeito) recomeça a validade do cadastro.
 */
export async function gravarCodigoEmail(dados: {
  email: string;
  usuarioId: string | null;
  cadastro: CadastroPendente | null;
  codigoHash: string;
  codigoCifrado: string;
  codigoExpiraEm: number;
  agora: number;
  esperaMs: number;
  renovar: boolean;
}): Promise<boolean> {
  const banco = await obterBanco();
  const valores = {
    usuarioId: dados.usuarioId,
    nome: dados.cadastro?.nome ?? null,
    senhaHash: dados.cadastro?.senhaHash ?? null,
    papel: dados.cadastro?.papel ?? null,
    codigoHash: dados.codigoHash,
    codigoCifrado: dados.codigoCifrado,
    codigoGeradoEm: new Date(dados.agora),
    codigoExpiraEm: new Date(dados.codigoExpiraEm),
    tentativas: 0,
    enviadoEm: new Date(dados.agora),
  };
  const gravados = await banco
    .insert(t.codigosEmail)
    .values({
      email: normalizarEmail(dados.email),
      ...valores,
      criadoEm: new Date(dados.agora),
    })
    .onConflictDoUpdate({
      target: t.codigosEmail.email,
      set: { ...valores, ...(dados.renovar ? { criadoEm: new Date(dados.agora) } : {}) },
      setWhere: lte(t.codigosEmail.enviadoEm, new Date(dados.agora - dados.esperaMs)),
    })
    .returning({ email: t.codigosEmail.email });
  return gravados.length > 0;
}

/**
 * Reenvio do MESMO código (um código por vez): renova a validade e a hora do envio e troca os
 * dados do cadastro, sem mexer no código nem nas tentativas. Só se a linha ainda tiver este
 * código, com tentativas sobrando, e o último envio foi há pelo menos `esperaMs`. Devolve se
 * renovou: dois envios ao mesmo tempo renovam um só, e só quem renovou manda o e-mail.
 */
export async function renovarEnvioDoCodigoEmail(dados: {
  email: string;
  codigoHash: string;
  usuarioId: string | null;
  cadastro: CadastroPendente | null;
  codigoExpiraEm: number;
  agora: number;
  esperaMs: number;
  maximoTentativas: number;
  renovar: boolean;
}): Promise<boolean> {
  const banco = await obterBanco();
  const renovados = await banco
    .update(t.codigosEmail)
    .set({
      usuarioId: dados.usuarioId,
      nome: dados.cadastro?.nome ?? null,
      senhaHash: dados.cadastro?.senhaHash ?? null,
      papel: dados.cadastro?.papel ?? null,
      codigoExpiraEm: new Date(dados.codigoExpiraEm),
      enviadoEm: new Date(dados.agora),
      ...(dados.renovar ? { criadoEm: new Date(dados.agora) } : {}),
    })
    .where(
      and(
        eq(t.codigosEmail.email, normalizarEmail(dados.email)),
        eq(t.codigosEmail.codigoHash, dados.codigoHash),
        lt(t.codigosEmail.tentativas, dados.maximoTentativas),
        lte(t.codigosEmail.enviadoEm, new Date(dados.agora - dados.esperaMs)),
      ),
    )
    .returning({ email: t.codigosEmail.email });
  return renovados.length > 0;
}

/**
 * Cadastro refeito antes de poder mandar outro código: troca nome, senha e tipo de conta e mantém
 * o código já enviado (que foi para o mesmo e-mail).
 */
export async function atualizarCadastroPendente(email: string, cadastro: CadastroPendente) {
  const banco = await obterBanco();
  await banco
    .update(t.codigosEmail)
    .set({ ...cadastro, criadoEm: new Date() })
    .where(and(eq(t.codigosEmail.email, normalizarEmail(email)), isNull(t.codigosEmail.usuarioId)));
}

/** O e-mail não saiu: libera o reenvio na hora, sem esperar os 60 segundos. */
export async function liberarReenvioDoCodigo(email: string) {
  const banco = await obterBanco();
  await banco
    .update(t.codigosEmail)
    .set({ enviadoEm: new Date(0) })
    .where(eq(t.codigosEmail.email, normalizarEmail(email)));
}

/**
 * Conta uma tentativa de digitar o código, se ainda houver tentativas. Devolve o hash do código e
 * quantas tentativas já foram (com esta), ou `null` se as tentativas acabaram. A contagem é no
 * banco, numa operação só: tentativas ao mesmo tempo não passam do máximo.
 */
export async function contarTentativaDoCodigo(
  email: string,
  maximo: number,
): Promise<{ codigoHash: string; tentativas: number } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.codigosEmail)
    .set({
      tentativas: sql`${t.codigosEmail.tentativas} + 1`,
      // Esgotou as tentativas: este código não será reenviado, então o cifrado sai.
      codigoCifrado: sql`case when ${t.codigosEmail.tentativas} + 1 >= ${maximo} then null else ${t.codigosEmail.codigoCifrado} end`,
    })
    .where(
      and(eq(t.codigosEmail.email, normalizarEmail(email)), lt(t.codigosEmail.tentativas, maximo)),
    )
    .returning({ codigoHash: t.codigosEmail.codigoHash, tentativas: t.codigosEmail.tentativas });
  return linha ?? null;
}

/** Usa o código (uma vez só): apaga a linha se o hash ainda for o mesmo e a devolve. */
export async function consumirCodigoEmail(
  email: string,
  codigoHash: string,
): Promise<CodigoEmail | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .delete(t.codigosEmail)
    .where(
      and(
        eq(t.codigosEmail.email, normalizarEmail(email)),
        eq(t.codigosEmail.codigoHash, codigoHash),
      ),
    )
    .returning();
  return linha ? paraCodigoEmail(linha) : null;
}

export async function apagarCodigoEmail(email: string) {
  const banco = await obterBanco();
  await banco.delete(t.codigosEmail).where(eq(t.codigosEmail.email, normalizarEmail(email)));
}

/** Cadastros abandonados e códigos de contas antigas criados antes de `limite` (job de pedidos). */
export async function apagarCodigosEmailAntigos(limite: number) {
  const banco = await obterBanco();
  await banco.delete(t.codigosEmail).where(lt(t.codigosEmail.criadoEm, new Date(limite)));
}

/**
 * O código cifrado só fica enquanto o código vale: apaga o dos códigos vencidos (confirmação do
 * e-mail e acesso do gestor). Roda no job de pedidos; quem lê já ignora o código vencido.
 */
export async function apagarCodigosCifradosVencidos(agora: number) {
  const banco = await obterBanco();
  await banco
    .update(t.codigosEmail)
    .set({ codigoCifrado: null })
    .where(lte(t.codigosEmail.codigoExpiraEm, new Date(agora)));
  await banco
    .update(t.codigosDeLogin)
    .set({ codigoCifrado: null })
    .where(lte(t.codigosDeLogin.expiraEm, new Date(agora)));
}

// ---------------------------------------------------------------- Código de acesso do gestor

export type CodigoDeLogin = {
  usuarioId: string;
  /** Login pendente que pediu o código (o mesmo id vai no cookie da segunda etapa). */
  loginId: string;
  codigoHash: string;
  /** O código cifrado (src/lib/codigo-cifrado.ts), para reenviar o mesmo; `null` se não há. */
  codigoCifrado: string | null;
  /** Quando o código foi gerado (teto da validade); `null` nas linhas antigas. */
  codigoGeradoEm: number | null;
  expiraEm: number;
  tentativas: number;
  reenvios: number;
  enviadoEm: number;
};

function paraCodigoDeLogin(r: typeof t.codigosDeLogin.$inferSelect): CodigoDeLogin {
  return {
    usuarioId: r.usuarioId,
    loginId: r.loginId,
    codigoHash: r.codigoHash,
    codigoCifrado: r.codigoCifrado,
    codigoGeradoEm: r.codigoGeradoEm?.getTime() ?? null,
    expiraEm: r.expiraEm.getTime(),
    tentativas: r.tentativas,
    reenvios: r.reenvios,
    enviadoEm: r.enviadoEm.getTime(),
  };
}

export async function buscarCodigoDeLogin(usuarioId: string): Promise<CodigoDeLogin | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.codigosDeLogin)
    .where(eq(t.codigosDeLogin.usuarioId, usuarioId));
  return linha ? paraCodigoDeLogin(linha) : null;
}

/**
 * Grava o código de um login novo: troca o de um login anterior do mesmo usuário e zera as
 * tentativas. `reenvios` é 1 quando o primeiro código não chegou a ser gravado (limite no login).
 */
export async function gravarCodigoDeLogin(dados: {
  usuarioId: string;
  loginId: string;
  codigoHash: string;
  codigoCifrado: string;
  expiraEm: number;
  agora: number;
  reenvios: number;
}) {
  const banco = await obterBanco();
  const valores = {
    loginId: dados.loginId,
    codigoHash: dados.codigoHash,
    codigoCifrado: dados.codigoCifrado,
    codigoGeradoEm: new Date(dados.agora),
    expiraEm: new Date(dados.expiraEm),
    tentativas: 0,
    reenvios: dados.reenvios,
    enviadoEm: new Date(dados.agora),
    criadoEm: new Date(dados.agora),
  };
  await banco
    .insert(t.codigosDeLogin)
    .values({ usuarioId: dados.usuarioId, ...valores })
    .onConflictDoUpdate({ target: t.codigosDeLogin.usuarioId, set: valores });
}

/**
 * Reenvio: troca o código do mesmo login (o anterior deixa de valer e as tentativas zeram), só se
 * já passou a espera desde o último envio e ainda há reenvios. Devolve se trocou: dois reenvios
 * ao mesmo tempo trocam um só, e só quem trocou manda o e-mail.
 */
export async function trocarCodigoDeLogin(dados: {
  usuarioId: string;
  loginId: string;
  codigoHash: string;
  codigoCifrado: string;
  expiraEm: number;
  agora: number;
  esperaMs: number;
  maximoReenvios: number;
}): Promise<boolean> {
  const banco = await obterBanco();
  const trocados = await banco
    .update(t.codigosDeLogin)
    .set({
      codigoHash: dados.codigoHash,
      codigoCifrado: dados.codigoCifrado,
      codigoGeradoEm: new Date(dados.agora),
      expiraEm: new Date(dados.expiraEm),
      tentativas: 0,
      reenvios: sql`${t.codigosDeLogin.reenvios} + 1`,
      enviadoEm: new Date(dados.agora),
    })
    .where(
      and(
        eq(t.codigosDeLogin.usuarioId, dados.usuarioId),
        eq(t.codigosDeLogin.loginId, dados.loginId),
        lt(t.codigosDeLogin.reenvios, dados.maximoReenvios),
        lte(t.codigosDeLogin.enviadoEm, new Date(dados.agora - dados.esperaMs)),
      ),
    )
    .returning({ usuarioId: t.codigosDeLogin.usuarioId });
  return trocados.length > 0;
}

/**
 * Manda o MESMO código de novo (um código por vez), sem mexer nas tentativas. Só se a linha ainda
 * tiver o código `codigoHashAnterior` do login `loginIdAnterior`, com tentativas sobrando. Dois usos:
 * - reenvio do mesmo login (`reenvio`): conta um reenvio e exige a espera e o máximo;
 * - login novo do mesmo usuário: passa o código ao login novo (`loginId` e o hash ligado a ele)
 *   e zera os reenvios.
 * Com `enviar: false` (o último envio foi há pouco), não mexe na hora do envio. Devolve se
 * renovou: só quem renovou segue (e manda o e-mail, se for o caso).
 */
export async function renovarCodigoDeLogin(dados: {
  usuarioId: string;
  loginIdAnterior: string;
  codigoHashAnterior: string;
  loginId: string;
  codigoHash: string;
  expiraEm: number;
  agora: number;
  maximoTentativas: number;
  enviar: boolean;
  reenvio?: { esperaMs: number; maximoReenvios: number };
}): Promise<boolean> {
  const banco = await obterBanco();
  const condicoes = [
    eq(t.codigosDeLogin.usuarioId, dados.usuarioId),
    eq(t.codigosDeLogin.loginId, dados.loginIdAnterior),
    eq(t.codigosDeLogin.codigoHash, dados.codigoHashAnterior),
    lt(t.codigosDeLogin.tentativas, dados.maximoTentativas),
  ];
  if (dados.reenvio) {
    condicoes.push(
      lt(t.codigosDeLogin.reenvios, dados.reenvio.maximoReenvios),
      lte(t.codigosDeLogin.enviadoEm, new Date(dados.agora - dados.reenvio.esperaMs)),
    );
  }
  const renovados = await banco
    .update(t.codigosDeLogin)
    .set({
      loginId: dados.loginId,
      codigoHash: dados.codigoHash,
      expiraEm: new Date(dados.expiraEm),
      reenvios: dados.reenvio ? sql`${t.codigosDeLogin.reenvios} + 1` : 0,
      ...(dados.enviar ? { enviadoEm: new Date(dados.agora) } : {}),
    })
    .where(and(...condicoes))
    .returning({ usuarioId: t.codigosDeLogin.usuarioId });
  return renovados.length > 0;
}

/** O e-mail não saiu: libera o reenvio na hora, sem esperar a espera entre envios. */
export async function liberarReenvioDoCodigoDeLogin(usuarioId: string, loginId: string) {
  const banco = await obterBanco();
  await banco
    .update(t.codigosDeLogin)
    .set({ enviadoEm: new Date(0) })
    .where(and(eq(t.codigosDeLogin.usuarioId, usuarioId), eq(t.codigosDeLogin.loginId, loginId)));
}

/**
 * Conta uma tentativa de digitar o código do login, se ainda houver tentativas. Devolve o hash e
 * quantas tentativas já foram (com esta), ou `null` se acabaram. Uma operação só no banco:
 * tentativas ao mesmo tempo não passam do máximo.
 */
export async function contarTentativaDoCodigoDeLogin(
  usuarioId: string,
  loginId: string,
  maximo: number,
): Promise<{ codigoHash: string; tentativas: number } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.codigosDeLogin)
    .set({
      tentativas: sql`${t.codigosDeLogin.tentativas} + 1`,
      codigoCifrado: sql`case when ${t.codigosDeLogin.tentativas} + 1 >= ${maximo} then null else ${t.codigosDeLogin.codigoCifrado} end`,
    })
    .where(
      and(
        eq(t.codigosDeLogin.usuarioId, usuarioId),
        eq(t.codigosDeLogin.loginId, loginId),
        lt(t.codigosDeLogin.tentativas, maximo),
      ),
    )
    .returning({
      codigoHash: t.codigosDeLogin.codigoHash,
      tentativas: t.codigosDeLogin.tentativas,
    });
  return linha ?? null;
}

/** Usa o código (uma vez só): apaga a linha se o hash ainda for o mesmo. Devolve se apagou. */
export async function consumirCodigoDeLogin(
  usuarioId: string,
  loginId: string,
  codigoHash: string,
): Promise<boolean> {
  const banco = await obterBanco();
  const apagados = await banco
    .delete(t.codigosDeLogin)
    .where(
      and(
        eq(t.codigosDeLogin.usuarioId, usuarioId),
        eq(t.codigosDeLogin.loginId, loginId),
        eq(t.codigosDeLogin.codigoHash, codigoHash),
      ),
    )
    .returning({ usuarioId: t.codigosDeLogin.usuarioId });
  return apagados.length > 0;
}

export async function apagarCodigoDeLogin(usuarioId: string) {
  const banco = await obterBanco();
  await banco.delete(t.codigosDeLogin).where(eq(t.codigosDeLogin.usuarioId, usuarioId));
}

/** Marca o e-mail como confirmado (a hora fica a primeira). */
export async function marcarEmailConfirmado(usuarioId: string) {
  const banco = await obterBanco();
  await banco
    .update(t.usuarios)
    .set({ emailConfirmadoEm: new Date() })
    .where(and(eq(t.usuarios.id, usuarioId), isNull(t.usuarios.emailConfirmadoEm)));
}

// ---------------------------------------------------------------- Redefinição de senha

export async function salvarRedefinicaoSenha(
  tokenHash: string,
  usuarioId: string,
  expiraEm: number,
) {
  const banco = await obterBanco();
  await banco
    .insert(t.redefinicoesSenha)
    .values({ tokenHash, usuarioId, expiraEm: new Date(expiraEm) });
}

/** Usa o link (uma vez só) e devolve o usuário, ou `null` se não existe ou venceu. */
export async function consumirRedefinicaoSenha(
  tokenHash: string,
  agora: number,
): Promise<string | null> {
  const banco = await obterBanco();
  const [apagado] = await banco
    .delete(t.redefinicoesSenha)
    .where(eq(t.redefinicoesSenha.tokenHash, tokenHash))
    .returning();
  if (!apagado || apagado.expiraEm.getTime() <= agora) return null;
  return apagado.usuarioId;
}

/** Apaga todos os links de redefinição pendentes da conta. */
export async function apagarRedefinicoesDoUsuario(usuarioId: string) {
  const banco = await obterBanco();
  await banco.delete(t.redefinicoesSenha).where(eq(t.redefinicoesSenha.usuarioId, usuarioId));
}

/** Links vencidos (job de pedidos). */
export async function apagarRedefinicoesVencidas(agora: number) {
  const banco = await obterBanco();
  await banco.delete(t.redefinicoesSenha).where(lt(t.redefinicoesSenha.expiraEm, new Date(agora)));
}
