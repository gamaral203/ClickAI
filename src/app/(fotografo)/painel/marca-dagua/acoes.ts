"use server";

import { revalidatePath } from "next/cache";

import { salvarModeloMarca } from "@/dados";
import { ehModeloMarca } from "@/lib/marca-dagua";
import { exigirFotografo } from "@/servicos/sessao";

/** Escolhe o modelo de marca d'água das próximas fotos enviadas. */
export async function escolherModeloMarcaAcao(modelo: unknown): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/marca-dagua");
  if (!ehModeloMarca(modelo)) return { erro: "Modelo inválido." };
  await salvarModeloMarca(conta.id, modelo);
  revalidatePath("/painel/marca-dagua");
  return {};
}
