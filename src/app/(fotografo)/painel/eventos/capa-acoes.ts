"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { definirCapaDoEvento } from "@/dados";
import { exigirFotografo } from "@/servicos/sessao";

// Capa do evento (docs/arquitetura.md, "Capa do evento"). Server Actions são endpoints públicos:
// a entrada é validada aqui e a camada de dados só grava em evento do fotógrafo logado (dono) e
// com uma foto pronta e não excluída daquele mesmo evento (sem IDOR).

const entrada = z.object({
  eventoId: z.uuid(),
  /** `null`: remove a escolha e volta para a capa automática. */
  fotoId: z.uuid().nullable(),
});

const MENSAGEM = {
  evento: "Evento não encontrado.",
  foto: "Essa foto não pode ser a capa: ela precisa ser deste evento e já estar pronta.",
} as const;

/** Escolhe a foto de capa do evento, ou volta para a automática (`fotoId` nulo). */
export async function definirCapaAcao(dados: unknown): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const pedido = entrada.safeParse(dados);
  if (!pedido.success) return { erro: MENSAGEM.foto };
  const { eventoId, fotoId } = pedido.data;
  const resultado = await definirCapaDoEvento(eventoId, conta.id, fotoId);
  if (!resultado.ok) return { erro: MENSAGEM[resultado.motivo] };
  revalidatePath(`/painel/eventos/${eventoId}`);
  return {};
}
