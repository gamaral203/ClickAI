"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  criarPasta,
  excluirPasta,
  moverItensParaPastaOuColaborador,
  moverPasta,
  renomearPasta,
  reordenarPasta,
} from "@/dados";
import { exigirFotografo } from "@/servicos/sessao";

// Pastas e subpastas de um evento no painel (ex.: Largada › Bateria 1), no máximo 2 níveis.
// Server Actions são públicas: valida a entrada com Zod; a camada de dados (src/dados/pastas.ts)
// confere o dono do evento e os níveis.

const id = z.uuid();
const nome = z.string().trim().min(1, "Dê um nome à pasta.").max(60, "Até 60 caracteres.");

type Resultado = { erro?: string };

function revalidar() {
  revalidatePath("/painel/eventos", "layout");
}

/** Cria uma pasta de nível 1 ou, com `pastaPaiId`, uma subpasta dela. */
export async function criarPastaAcao(
  eventoId: string,
  texto: string,
  pastaPaiId: unknown = null,
): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const dados = nome.safeParse(texto);
  const pai = id.nullable().safeParse(pastaPaiId);
  if (!id.safeParse(eventoId).success) return { erro: "Evento não encontrado." };
  if (!pai.success) return { erro: "Pasta não encontrada." };
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const resultado = await criarPasta(eventoId, conta.id, dados.data, pai.data);
  if ("erro" in resultado) return { erro: resultado.erro };
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

/** Leva a pasta para o nível 1 (`novoPaiId` nulo) ou para dentro de outra pasta de nível 1. */
export async function moverPastaAcao(pastaId: unknown, novoPaiId: unknown): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const pasta = id.safeParse(pastaId);
  const pai = id.nullable().safeParse(novoPaiId);
  if (!pasta.success || !pai.success) return { erro: "Pasta não encontrada." };
  const resultado = await moverPasta(pasta.data, conta.id, pai.data);
  if (resultado.erro) return resultado;
  revalidar();
  return {};
}

/** Sobe ou desce a pasta uma posição, dentro do mesmo nível. */
export async function reordenarPastaAcao(pastaId: unknown, direcao: unknown): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const pasta = id.safeParse(pastaId);
  const sentido = z.enum(["subir", "descer"]).safeParse(direcao);
  if (!pasta.success || !sentido.success) return { erro: "Pasta não encontrada." };
  if (!(await reordenarPasta(pasta.data, conta.id, sentido.data))) {
    return { erro: "Pasta não encontrada." };
  }
  revalidar();
  return {};
}

/** Apaga a pasta e as subpastas; as fotos continuam no evento, sem pasta. */
export async function excluirPastaAcao(pastaId: string): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  if (!id.safeParse(pastaId).success) return { erro: "Pasta não encontrada." };
  if (!(await excluirPasta(pastaId, conta.id))) return { erro: "Pasta não encontrada." };
  revalidar();
  return {};
}

/**
 * Move itens para uma pasta ou subpasta do mesmo evento, ou tira da pasta (`pastaId` nulo). O
 * dono move qualquer item do evento; o colaborador com o convite aceito, só os que ele enviou.
 */
export async function moverParaPastaAcao(fotoIds: unknown, pastaId: unknown): Promise<Resultado> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const ids = z.array(id).min(1).max(500).safeParse(fotoIds);
  const pasta = id.nullable().safeParse(pastaId);
  if (!ids.success || !pasta.success) return { erro: "Não foi possível mover." };
  if (!(await moverItensParaPastaOuColaborador(ids.data, pasta.data, conta.id))) {
    return { erro: "Não foi possível mover." };
  }
  revalidar();
  revalidatePath("/painel/colaboracoes");
  return {};
}
