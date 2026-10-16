// Códigos de confirmação por e-mail das ações sensíveis (src/servicos/codigo-acao.ts). O código
// chega aqui só como HMAC.

import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type CodigoDeAcao = {
  codigoHash: string;
  expiraEm: number;
  tentativas: number;
  enviadoEm: number;
};

const daChave = (usuarioId: string, finalidade: string) =>
  and(eq(t.codigosDeAcao.usuarioId, usuarioId), eq(t.codigosDeAcao.finalidade, finalidade));

export async function buscarCodigoDeAcao(
  usuarioId: string,
  finalidade: string,
): Promise<CodigoDeAcao | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.codigosDeAcao).where(daChave(usuarioId, finalidade));
  if (!linha) return null;
  return {
    codigoHash: linha.codigoHash,
    expiraEm: linha.expiraEm.getTime(),
    tentativas: linha.tentativas,
    enviadoEm: linha.enviadoEm.getTime(),
  };
}

/** Grava um código novo para a finalidade (o anterior deixa de valer). */
export async function gravarCodigoDeAcao(dados: {
  usuarioId: string;
  finalidade: string;
  codigoHash: string;
  expiraEm: number;
  agora: number;
}) {
  const banco = await obterBanco();
  const valores = {
    codigoHash: dados.codigoHash,
    expiraEm: new Date(dados.expiraEm),
    tentativas: 0,
    enviadoEm: new Date(dados.agora),
  };
  await banco
    .insert(t.codigosDeAcao)
    .values({ usuarioId: dados.usuarioId, finalidade: dados.finalidade, ...valores })
    .onConflictDoUpdate({
      target: [t.codigosDeAcao.usuarioId, t.codigosDeAcao.finalidade],
      set: valores,
    });
}

/**
 * Conta uma tentativa (atômico) e devolve o código como ficou, ou `null` sem código. Contar antes
 * de conferir impede que tentativas ao mesmo tempo passem do limite.
 */
export async function contarTentativaDoCodigoDeAcao(
  usuarioId: string,
  finalidade: string,
): Promise<CodigoDeAcao | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.codigosDeAcao)
    .set({ tentativas: sql`${t.codigosDeAcao.tentativas} + 1` })
    .where(daChave(usuarioId, finalidade))
    .returning();
  if (!linha) return null;
  return {
    codigoHash: linha.codigoHash,
    expiraEm: linha.expiraEm.getTime(),
    tentativas: linha.tentativas,
    enviadoEm: linha.enviadoEm.getTime(),
  };
}

/** Apaga o código (usado): devolve `false` se outra conferência já o usou. */
export async function apagarCodigoDeAcao(
  usuarioId: string,
  finalidade: string,
  codigoHash: string,
) {
  const banco = await obterBanco();
  const apagados = await banco
    .delete(t.codigosDeAcao)
    .where(and(daChave(usuarioId, finalidade), eq(t.codigosDeAcao.codigoHash, codigoHash)))
    .returning({ usuarioId: t.codigosDeAcao.usuarioId });
  return apagados.length > 0;
}
