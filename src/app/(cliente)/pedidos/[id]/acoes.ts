"use server";

import { z } from "zod";

import { buscarPedidoComAcesso, confirmarPagamento } from "@/servicos/pedidos";
import { usuarioAtual } from "@/servicos/sessao";

const entrada = z.object({ pedidoId: z.uuid(), token: z.string().min(20).max(100).nullable() });

/**
 * Pagamento simulado (Parte A). Chama a mesma confirmação que o webhook do gateway vai
 * chamar na Fase 13; some quando o gateway entrar.
 */
export async function simularPagamento(pedidoId: string, token: string | null): Promise<boolean> {
  const dados = entrada.safeParse({ pedidoId, token });
  if (!dados.success) return false;
  const usuario = await usuarioAtual();
  const encontrado = await buscarPedidoComAcesso(dados.data.pedidoId, {
    token: dados.data.token,
    clienteId: usuario?.id,
  });
  if (!encontrado || encontrado.pedido.status !== "pendente") return false;
  return confirmarPagamento(encontrado.pedido.id);
}
