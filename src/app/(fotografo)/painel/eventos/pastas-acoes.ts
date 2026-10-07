"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { criarPasta, excluirPasta, moverItensParaPasta, renomearPasta } from "@/dados";
import { exigirFotografo } from "@/servicos/sessao";

// Pastas de um evento no painel (ex.: Largada, Percurso, Chegada). Server Actions são públicas:
// valida a entrada; a camada de dados confere o dono.

const id = z.uuid();
const nome = z.string().trim().min(1, "Dê um nome à pasta.").max(60, "Até 60 caracteres.");

type Resultado = { erro?: string };

function revalidar() {
  revalidatePath("/painel/eventos", "layout");
}

export async function criarPastaAcao(eventoId: string, texto: string): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const dados = nome.safeParse(texto);
  if (!id.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  if (!(await criarPasta(eventoId, conta.id, dados.data)))
    return { erro: "Evento não encontrado." };
  revalidar();
  return {};
}

export async function renomearPastaAcao(pastaId: string, texto: string): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const dados = nome.safeParse(texto);
  if (!id.safeParse(pastaId).success) return { erro: "Pasta não encontrada." };
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  if (!(await renomearPasta(pastaId, conta.id, dados.data)))
    return { erro: "Pasta não encontrada." };
  revalidar();
  return {};
}

export async function excluirPastaAcao(pastaId: string): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!id.safeParse(pastaId).success) return { erro: "Pasta não encontrada." };
  if (!(await excluirPasta(pastaId, conta.id))) return { erro: "Pasta não encontrada." };
  revalidar();
  return {};
}

/** Move itens para uma pasta do mesmo evento, ou tira da pasta (`pastaId` nulo). */
export async function moverParaPastaAcao(fotoIds: unknown, pastaId: unknown): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const ids = z.array(id).min(1).max(500).safeParse(fotoIds);
  const pasta = id.nullable().safeParse(pastaId);
  if (!ids.success || !pasta.success) return { erro: "Não foi possível mover." };
  if (!(await moverItensParaPasta(ids.data, pasta.data, conta.id))) {
    return { erro: "Não foi possível mover." };
  }
  revalidar();
  return {};
}
