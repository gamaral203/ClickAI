// Dados da verificação em duas etapas (src/servicos/mfa.ts). O segredo chega e sai daqui já
// cifrado; os códigos de recuperação, só como hash.

import "server-only";

import { and, count, eq, isNotNull, isNull, lt, or } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type EstadoMfa = {
  /** Ligada: o login e as ações sensíveis pedem o código. */
  ativo: boolean;
  ativadoEm: string | null;
  /** Códigos de recuperação ainda não usados. */
  codigosRestantes: number;
};

export type SegredoMfa = {
  /** Segredo cifrado (src/lib/mfa.ts). */
  segredo: string;
  /** `null` enquanto o cadastro não foi confirmado com o primeiro código. */
  ativadoEm: string | null;
};

export async function estadoMfa(usuarioId: string): Promise<EstadoMfa> {
  const banco = await obterBanco();
  const [[usuario], [{ total }]] = await Promise.all([
    banco
      .select({ ativadoEm: t.usuarios.mfaAtivadoEm })
      .from(t.usuarios)
      .where(eq(t.usuarios.id, usuarioId)),
    banco
      .select({ total: count() })
      .from(t.codigosRecuperacao)
      .where(
        and(eq(t.codigosRecuperacao.usuarioId, usuarioId), isNull(t.codigosRecuperacao.usadoEm)),
      ),
  ]);
  const ativadoEm = usuario?.ativadoEm ? usuario.ativadoEm.toISOString() : null;
  return { ativo: ativadoEm !== null, ativadoEm, codigosRestantes: ativadoEm ? total : 0 };
}

export async function segredoMfa(usuarioId: string): Promise<SegredoMfa | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ segredo: t.usuarios.mfaSegredo, ativadoEm: t.usuarios.mfaAtivadoEm })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.id, usuarioId), isNull(t.usuarios.excluidoEm)));
  if (!linha?.segredo) return null;
  return {
    segredo: linha.segredo,
    ativadoEm: linha.ativadoEm ? linha.ativadoEm.toISOString() : null,
  };
}

/**
 * Guarda o segredo de um cadastro que ainda vai ser confirmado. Nunca troca o segredo de uma
 * verificação já ligada (para isso, desligar antes). Devolve `false` se ela já está ligada.
 */
export async function salvarSegredoPendente(usuarioId: string, segredo: string) {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.usuarios)
    .set({ mfaSegredo: segredo, mfaUltimoPasso: null })
    .where(and(eq(t.usuarios.id, usuarioId), isNull(t.usuarios.mfaAtivadoEm)))
    .returning({ id: t.usuarios.id });
  return linhas.length > 0;
}

/**
 * Liga a verificação com o segredo pendente, marca o passo do código usado e grava os códigos de
 * recuperação (só os hashes), numa transação. `false` se não havia cadastro pendente.
 */
export async function ativarMfa(
  usuarioId: string,
  passo: number,
  hashesDosCodigos: string[],
): Promise<boolean> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const linhas = await tx
      .update(t.usuarios)
      .set({ mfaAtivadoEm: new Date(), mfaUltimoPasso: passo })
      .where(
        and(
          eq(t.usuarios.id, usuarioId),
          isNull(t.usuarios.mfaAtivadoEm),
          isNotNull(t.usuarios.mfaSegredo),
        ),
      )
      .returning({ id: t.usuarios.id });
    if (linhas.length === 0) return false;
    await tx.delete(t.codigosRecuperacao).where(eq(t.codigosRecuperacao.usuarioId, usuarioId));
    await tx
      .insert(t.codigosRecuperacao)
      .values(hashesDosCodigos.map((codigoHash) => ({ usuarioId, codigoHash })));
    return true;
  });
}

/**
 * Marca o passo do código como usado, se for mais novo que o último aceito. `false` quando o
 * código já foi usado (alguém viu e repetiu) ou a verificação não está ligada.
 */
export async function consumirPassoMfa(usuarioId: string, passo: number): Promise<boolean> {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.usuarios)
    .set({ mfaUltimoPasso: passo })
    .where(
      and(
        eq(t.usuarios.id, usuarioId),
        isNotNull(t.usuarios.mfaAtivadoEm),
        or(isNull(t.usuarios.mfaUltimoPasso), lt(t.usuarios.mfaUltimoPasso, passo)),
      ),
    )
    .returning({ id: t.usuarios.id });
  return linhas.length > 0;
}

/** Usa um código de recuperação (uma vez só). `false` se não existe ou já foi usado. */
export async function consumirCodigoRecuperacao(
  usuarioId: string,
  codigoHash: string,
): Promise<boolean> {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.codigosRecuperacao)
    .set({ usadoEm: new Date() })
    .where(
      and(
        eq(t.codigosRecuperacao.usuarioId, usuarioId),
        eq(t.codigosRecuperacao.codigoHash, codigoHash),
        isNull(t.codigosRecuperacao.usadoEm),
      ),
    )
    .returning({ id: t.codigosRecuperacao.id });
  return linhas.length > 0;
}

/** Troca todos os códigos de recuperação por novos (os antigos deixam de valer). */
export async function trocarCodigosRecuperacao(usuarioId: string, hashesDosCodigos: string[]) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx.delete(t.codigosRecuperacao).where(eq(t.codigosRecuperacao.usuarioId, usuarioId));
    await tx
      .insert(t.codigosRecuperacao)
      .values(hashesDosCodigos.map((codigoHash) => ({ usuarioId, codigoHash })));
  });
}

/** Desliga a verificação: apaga o segredo e os códigos de recuperação. */
export async function desligarMfa(usuarioId: string) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx
      .update(t.usuarios)
      .set({ mfaSegredo: null, mfaAtivadoEm: null, mfaUltimoPasso: null })
      .where(eq(t.usuarios.id, usuarioId));
    await tx.delete(t.codigosRecuperacao).where(eq(t.codigosRecuperacao.usuarioId, usuarioId));
  });
}
