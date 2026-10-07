"use server";

import { z } from "zod";

import { buscarPedidoDoConvidado, confirmarPagamento } from "@/servicos/pedidos";

const entrada = z.object({ pedidoId: z.uuid(), token: z.string().min(20).max(100) });

/**
 * Pagamento simulado (Parte A). Chama a mesma confirmação que o webhook do gateway vai
 * chamar na Fase 13; some quando o gateway entrar.
 */
export async function simularPagamento(pedidoId: string, token: string): Promise<boolean> {
  const dados = entrada.safeParse({ pedidoId, token });
  if (!dados.success) return false;
  const encontrado = await buscarPedidoDoConvidado(dados.data.pedidoId, dados.data.token);
  if (!encontrado || encontrado.pedido.status !== "pendente") return false;
  return confirmarPagamento(encontrado.pedido.id);
}
