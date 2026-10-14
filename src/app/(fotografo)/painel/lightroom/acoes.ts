"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MAXIMO_DE_CHAVES_ATIVAS, revogarChaveApi } from "@/dados/chaves-api";
import { gerarChaveApi } from "@/servicos/chaves-api";
import { exigirFotografo } from "@/servicos/sessao";

const nomeDaChave = z.string().trim().min(1).max(60);

/**
 * Gera uma chave de acesso para o plugin do Lightroom. A chave inteira volta só aqui, para a tela
 * mostrar uma vez; depois só o começo dela aparece na lista.
 */
export async function gerarChaveAcao(nome: unknown): Promise<{ erro: string } | { chave: string }> {
  const { conta } = await exigirFotografo("/painel/lightroom");
  const dados = nomeDaChave.safeParse(nome);
  if (!dados.success) return { erro: "Dê um nome à chave, por exemplo o do computador." };
  const criada = await gerarChaveApi(conta.id, dados.data);
  if (!criada) {
    return {
      erro: `Você já tem ${MAXIMO_DE_CHAVES_ATIVAS} chaves. Apague uma que não usa mais.`,
    };
  }
  revalidatePath("/painel/lightroom");
  return { chave: criada.chave };
}

/** Apaga (revoga) uma chave: o plugin que a usa para de enviar na hora. */
export async function apagarChaveAcao(chaveId: unknown): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/lightroom");
  const id = z.uuid().safeParse(chaveId);
  if (!id.success || !(await revogarChaveApi(id.data, conta.id))) {
    return { erro: "Chave não encontrada." };
  }
  revalidatePath("/painel/lightroom");
  return {};
}
