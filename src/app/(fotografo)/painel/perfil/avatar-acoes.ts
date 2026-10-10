"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { definirAvatarDoFotografo } from "@/dados";
import { AVATARES } from "@/lib/avatares";
import { exigirFotografo } from "@/servicos/sessao";

export type ResultadoAvatar = { ok: true } | { ok: false; erro: string };

const idDoAvatar = z.enum(AVATARES.map((a) => a.id) as [string, ...string[]]);

/** Guarda o avatar escolhido em Perfil e recebimento. Só aceita um id do catálogo. */
export async function escolherAvatarAcao(avatar: unknown): Promise<ResultadoAvatar> {
  const { conta } = await exigirFotografo("/painel/perfil");
  const escolha = idDoAvatar.safeParse(avatar);
  if (!escolha.success) return { ok: false, erro: "Escolha um dos avatares da lista." };
  await definirAvatarDoFotografo(conta.id, escolha.data);
  // O avatar aparece no cabeçalho e no topo do painel, na página pública e na loja.
  revalidatePath("/painel", "layout");
  revalidatePath(`/fotografo/${conta.slug}`);
  return { ok: true };
}
