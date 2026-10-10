// Inscrições de notificação do navegador (Web Push) e quem recebe cada aviso.

import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type InscricaoPush = { endpoint: string; p256dh: string; auth: string };

/** Guarda a inscrição do aparelho; o mesmo endpoint passa a ser do usuário que ativou por último. */
export async function salvarInscricaoPush(usuarioId: string, inscricao: InscricaoPush) {
  const banco = await obterBanco();
  await banco
    .insert(t.inscricoesPush)
    .values({ usuarioId, ...inscricao })
    .onConflictDoUpdate({
      target: t.inscricoesPush.endpoint,
      set: { usuarioId, p256dh: inscricao.p256dh, auth: inscricao.auth },
    });
}

/** O usuário desativou as notificações neste aparelho. */
export async function removerInscricaoPush(usuarioId: string, endpoint: string) {
  const banco = await obterBanco();
  await banco
    .delete(t.inscricoesPush)
    .where(and(eq(t.inscricoesPush.usuarioId, usuarioId), eq(t.inscricoesPush.endpoint, endpoint)));
}

/** O navegador disse que a inscrição venceu (404/410): não adianta mandar de novo. */
export async function apagarInscricaoPush(endpoint: string) {
  const banco = await obterBanco();
  await banco.delete(t.inscricoesPush).where(eq(t.inscricoesPush.endpoint, endpoint));
}

export async function inscricoesDosUsuarios(usuarioIds: string[]): Promise<InscricaoPush[]> {
  if (usuarioIds.length === 0) return [];
  const banco = await obterBanco();
  return banco
    .select({
      endpoint: t.inscricoesPush.endpoint,
      p256dh: t.inscricoesPush.p256dh,
      auth: t.inscricoesPush.auth,
    })
    .from(t.inscricoesPush)
    .where(inArray(t.inscricoesPush.usuarioId, usuarioIds));
}

/** O usuário tem notificação ativa em algum aparelho? */
export async function temInscricaoPush(usuarioId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.inscricoesPush.id })
    .from(t.inscricoesPush)
    .where(eq(t.inscricoesPush.usuarioId, usuarioId))
    .limit(1);
  return linha !== undefined;
}

/** Quem é da gestão (papel admin), para os avisos de saque. */
export async function gestoresParaAviso(): Promise<{ id: string; email: string; nome: string }[]> {
  const banco = await obterBanco();
  return banco
    .select({ id: t.usuarios.id, email: t.usuarios.email, nome: t.usuarios.nome })
    .from(t.usuarios)
    .where(eq(t.usuarios.papel, "admin"));
}

/** Usuário dono da conta de fotógrafo (para avisar dele). */
export async function usuarioDoFotografo(
  fotografoId: string,
): Promise<{ id: string; email: string; nome: string } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.usuarios.id, email: t.usuarios.email, nome: t.fotografos.nomePublico })
    .from(t.fotografos)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId))
    .where(eq(t.fotografos.id, fotografoId));
  return linha ?? null;
}
