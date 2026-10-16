"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { definirPreviaDesfocada, salvarAjustesDaMarca, salvarModeloMarca } from "@/dados";
import { ehModeloMarca } from "@/lib/marca-dagua";
import { esquemaAjustesMarca } from "@/lib/protecao-previas";
import { exigirFotografo } from "@/servicos/sessao";

/** Escolhe o modelo de marca d'água das próximas fotos enviadas. */
export async function escolherModeloMarcaAcao(modelo: unknown): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/marca-dagua");
  if (!ehModeloMarca(modelo)) return { erro: "Modelo inválido." };
  await salvarModeloMarca(conta.id, modelo);
  revalidatePath("/painel/marca-dagua");
  return {};
}

export type ValoresDosAjustes = { tamanhoPct: number; quantidade: number; opacidadePct: number };

/**
 * Salva os ajustes da marca do fotógrafo (tamanho, quantidade e opacidade), nos limites da gestão;
 * `null` volta para os valores da gestão. Valem para as próximas fotos, como o modelo.
 */
export async function salvarAjustesDaMarcaAcao(
  valores: unknown,
): Promise<{ erro?: string; ok?: string }> {
  const { conta } = await exigirFotografo("/painel/marca-dagua");
  if (valores === null) {
    await salvarAjustesDaMarca(conta.id, null);
    revalidatePath("/painel/marca-dagua");
    return { ok: "Voltou para a marca padrão do ClicouAí. Vale para as próximas fotos." };
  }
  const dados = esquemaAjustesMarca.safeParse(valores);
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Valores inválidos." };
  }
  await salvarAjustesDaMarca(conta.id, dados.data);
  revalidatePath("/painel/marca-dagua");
  return { ok: "Ajustes salvos. Valem para as próximas fotos que você enviar." };
}

/** Liga ou desliga a prévia desfocada com o círculo de revelação de um evento do fotógrafo. */
export async function definirPreviaDesfocadaAcao(
  eventoId: unknown,
  ligada: unknown,
): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/marca-dagua");
  if (!z.uuid().safeParse(eventoId).success || typeof ligada !== "boolean") {
    return { erro: "Pedido inválido." };
  }
  if (!(await definirPreviaDesfocada(eventoId as string, conta.id, ligada))) {
    return { erro: "Evento não encontrado." };
  }
  revalidatePath("/painel/marca-dagua");
  revalidatePath("/eventos", "layout");
  return {};
}
