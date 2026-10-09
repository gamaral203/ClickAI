"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { responderConvite } from "@/dados";
import { exigirFotografo } from "@/servicos/sessao";

/** O convidado aceita ou recusa o convite para colaborar num evento. */
export async function responderConviteAcao(
  colaboradorId: string,
  aceitar: boolean,
): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/colaboracoes");
  if (!z.uuid().safeParse(colaboradorId).success || typeof aceitar !== "boolean") {
    return { erro: "Convite não encontrado." };
  }
  if (!(await responderConvite(colaboradorId, conta.id, aceitar))) {
    return { erro: "Este convite já foi respondido ou não existe mais." };
  }
  revalidatePath("/painel/colaboracoes");
  return {};
}
