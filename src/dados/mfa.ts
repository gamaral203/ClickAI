// Dados da verificação em duas etapas. Desde 16/10/2026 ela é por e-mail (src/servicos/codigo-login.ts
// e codigo-acao.ts): ligada é só `usuarios.mfa_ativado_em`; as colunas do app autenticador
// (segredo, último passo) e os códigos de recuperação ficaram sem uso e são limpos ao desligar.

import "server-only";

import { eq } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type EstadoMfa = {
  /** Ligada: o login pede o código enviado ao e-mail. */
  ativo: boolean;
  ativadoEm: string | null;
};

export async function estadoMfa(usuarioId: string): Promise<EstadoMfa> {
  const banco = await obterBanco();
  const [usuario] = await banco
    .select({ ativadoEm: t.usuarios.mfaAtivadoEm })
    .from(t.usuarios)
    .where(eq(t.usuarios.id, usuarioId));
  const ativadoEm = usuario?.ativadoEm ? usuario.ativadoEm.toISOString() : null;
  return { ativo: ativadoEm !== null, ativadoEm };
}

/** Desliga a verificação (e limpa o que sobrou do app autenticador). */
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

/**
 * Liga a verificação em duas etapas por e-mail (desde 16/10/2026; antes era o app autenticador):
 * só a data de ativação, sem segredo nem códigos de recuperação. O login passa a pedir o código
 * enviado ao e-mail (src/servicos/codigo-login.ts).
 */
export async function ligarVerificacaoPorEmail(usuarioId: string) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx
      .update(t.usuarios)
      .set({ mfaSegredo: null, mfaAtivadoEm: new Date(), mfaUltimoPasso: null })
      .where(eq(t.usuarios.id, usuarioId));
    await tx.delete(t.codigosRecuperacao).where(eq(t.codigosRecuperacao.usuarioId, usuarioId));
  });
}
