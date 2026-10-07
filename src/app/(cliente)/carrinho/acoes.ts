"use server";

import { z } from "zod";

import { calcularCarrinho, type ResumoCarrinho } from "@/servicos/carrinho";

const MAXIMO_ITENS = 200;
const entrada = z.array(z.uuid()).max(MAXIMO_ITENS);

/** Preços e totais do carrinho, recalculados no servidor. Server Actions são públicas: valida tudo. */
export async function obterCarrinho(ids: unknown): Promise<ResumoCarrinho | null> {
  const dados = entrada.safeParse(ids);
  if (!dados.success) return null;
  return calcularCarrinho([...new Set(dados.data)]);
}
