// Chaves de acesso do plugin do Lightroom (tabela `chaves_api`): criadas e revogadas pelo
// fotógrafo em Painel > Lightroom e conferidas a cada chamada do plugin (src/servicos/chaves-api.ts).

import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import type { Papel } from "./tipos";

/** Máximo de chaves ativas por fotógrafo (uma por computador com o Lightroom, com folga). */
export const MAXIMO_DE_CHAVES_ATIVAS = 10;

export type ChaveApiDoPainel = {
  id: string;
  nome: string;
  prefixo: string;
  criadaEm: string;
  usadaEm: string | null;
};

/** Chaves ativas do fotógrafo, da mais nova para a mais antiga (sem o hash). */
export async function listarChavesApi(fotografoId: string): Promise<ChaveApiDoPainel[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.chavesApi.id,
      nome: t.chavesApi.nome,
      prefixo: t.chavesApi.prefixo,
      criadaEm: t.chavesApi.criadaEm,
      usadaEm: t.chavesApi.usadaEm,
    })
    .from(t.chavesApi)
    .where(and(eq(t.chavesApi.fotografoId, fotografoId), isNull(t.chavesApi.revogadaEm)))
    .orderBy(desc(t.chavesApi.criadaEm));
  return linhas.map((l) => ({
    ...l,
    criadaEm: l.criadaEm.toISOString(),
    usadaEm: l.usadaEm?.toISOString() ?? null,
  }));
}

/** Grava uma chave nova; `null` se o fotógrafo já tem o máximo de chaves ativas. */
export async function criarChaveApi(dados: {
  fotografoId: string;
  nome: string;
  prefixo: string;
  segredoHash: string;
}): Promise<{ id: string } | null> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const ativas = await tx
      .select({ id: t.chavesApi.id })
      .from(t.chavesApi)
      .where(and(eq(t.chavesApi.fotografoId, dados.fotografoId), isNull(t.chavesApi.revogadaEm)));
    if (ativas.length >= MAXIMO_DE_CHAVES_ATIVAS) return null;
    const [linha] = await tx.insert(t.chavesApi).values(dados).returning({ id: t.chavesApi.id });
    return linha;
  });
}

/** Revoga uma chave do fotógrafo; `false` se não é dele ou já estava revogada. */
export async function revogarChaveApi(chaveId: string, fotografoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.chavesApi)
    .set({ revogadaEm: new Date() })
    .where(
      and(
        eq(t.chavesApi.id, chaveId),
        eq(t.chavesApi.fotografoId, fotografoId),
        isNull(t.chavesApi.revogadaEm),
      ),
    )
    .returning({ id: t.chavesApi.id });
  return linhas.length > 0;
}

export type DonoDaChave = {
  chaveId: string;
  fotografoId: string;
  nome: string;
  /** Papel do usuário dono da chave (o modo de manutenção só deixa o gestor passar). */
  papel: Papel;
};

/**
 * Fotógrafo dono da chave com este hash, se ela vale: não revogada, de um usuário não excluído
 * que ainda pode usar o painel (fotógrafo ou gestor). Marca o último uso no máximo uma vez por
 * minuto, para a lista do painel mostrar "usada há pouco" sem uma escrita por chamada.
 */
export async function donoDaChaveApi(segredoHash: string): Promise<DonoDaChave | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      chaveId: t.chavesApi.id,
      usadaEm: t.chavesApi.usadaEm,
      fotografoId: t.fotografos.id,
      nome: t.fotografos.nomePublico,
      papel: t.usuarios.papel,
    })
    .from(t.chavesApi)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.chavesApi.fotografoId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId))
    .where(
      and(
        eq(t.chavesApi.segredoHash, segredoHash),
        isNull(t.chavesApi.revogadaEm),
        isNull(t.usuarios.excluidoEm),
        inArray(t.usuarios.papel, ["fotografo", "admin"]),
      ),
    );
  if (!linha) return null;
  if (!linha.usadaEm || Date.now() - linha.usadaEm.getTime() > 60_000) {
    await banco
      .update(t.chavesApi)
      .set({ usadaEm: new Date() })
      .where(eq(t.chavesApi.id, linha.chaveId));
  }
  return {
    chaveId: linha.chaveId,
    fotografoId: linha.fotografoId,
    nome: linha.nome,
    papel: linha.papel,
  };
}
