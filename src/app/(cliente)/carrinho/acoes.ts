"use server";

import { z } from "zod";

import { calcularCarrinho, type ResumoCarrinho } from "@/servicos/carrinho";

import { opcoesCompra } from "./validacao";

const MAXIMO_ITENS = 200;
const entrada = z.array(z.uuid()).max(MAXIMO_ITENS);

/**
 * Preços, descontos e totais do carrinho, recalculados no servidor. Server Actions são
 * públicas: valida tudo, e os tokens dos pacotes são conferidos pela assinatura.
 */
export async function obterCarrinho(
  ids: unknown,
  opcoes?: unknown,
): Promise<ResumoCarrinho | null> {
  const dados = entrada.safeParse(ids);
  const extras = opcoesCompra.safeParse(opcoes ?? {});
  if (!dados.success || !extras.success) return null;
  return calcularCarrinho([...new Set(dados.data)], extras.data);
}
