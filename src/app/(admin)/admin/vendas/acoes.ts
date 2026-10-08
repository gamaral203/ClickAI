"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buscarPedido } from "@/dados";
import { formatarPreco } from "@/lib/formatar";
import { reembolsarPedido, restaurarContestacao } from "@/servicos/estornos";
import { exigirGestor } from "@/servicos/sessao";

// Reembolso e contestação de pedidos: só o gestor. O valor nunca vem do navegador: o reembolso
// é sempre o total do pedido, e o Mercado Pago devolve o que foi cobrado na order.

export type ResultadoAcaoEstorno = { ok: true; mensagem: string } | { ok: false; erro: string };

const reembolso = z.object({
  pedidoId: z.uuid(),
  /** Confirmação explícita: o gestor digita o valor do pedido, que só é comparado aqui. */
  confirmacao: z.string().max(40),
});

const MENSAGEM_ERRO_REEMBOLSO = {
  inexistente: "Pedido não encontrado.",
  nao_pago: "Só pedidos pagos podem ser reembolsados.",
  sem_cobranca: "Este pedido não tem cobrança no Mercado Pago.",
  falhou:
    "O Mercado Pago não confirmou o pedido de reembolso. Os downloads já estão parados; tente de novo.",
} as const;

/** "R$ 19,90", "19,90" → "19,90", para comparar com o total do pedido. */
function normalizarValor(texto: string) {
  return texto.replace(/R\$|\s/g, "");
}

export async function reembolsarAcao(
  pedidoId: string,
  confirmacao: string,
): Promise<ResultadoAcaoEstorno> {
  const gestor = await exigirGestor("/admin/vendas");
  const dados = reembolso.safeParse({ pedidoId, confirmacao });
  if (!dados.success) return { ok: false, erro: "Pedido inválido." };

  const encontrado = await buscarPedido(dados.data.pedidoId);
  if (!encontrado) return { ok: false, erro: MENSAGEM_ERRO_REEMBOLSO.inexistente };
  const esperado = normalizarValor(formatarPreco(encontrado.pedido.totalCentavos));
  if (normalizarValor(dados.data.confirmacao) !== esperado) {
    return { ok: false, erro: `Para confirmar, digite o valor do pedido: ${esperado}.` };
  }

  const resultado = await reembolsarPedido(gestor, dados.data.pedidoId);
  revalidatePath("/admin", "layout");
  if (!resultado.ok) return { ok: false, erro: MENSAGEM_ERRO_REEMBOLSO[resultado.motivo] };
  return {
    ok: true,
    mensagem:
      resultado.situacao === "estornado"
        ? "Pedido reembolsado e estornado."
        : "Reembolso pedido ao Mercado Pago. O pedido é estornado quando a devolução for confirmada.",
  };
}

const MENSAGEM_ERRO_RESTAURACAO = {
  inexistente: "Pedido não encontrado.",
  nao_contestado: "Este pedido não está em contestação.",
  order_nao_paga:
    "O Mercado Pago ainda não mostra a order como paga: a contestação não foi encerrada a favor.",
  falhou: "Não foi possível consultar o Mercado Pago. Tente de novo.",
} as const;

export async function restaurarAcao(pedidoId: string): Promise<ResultadoAcaoEstorno> {
  await exigirGestor("/admin/vendas");
  const id = z.uuid().safeParse(pedidoId);
  if (!id.success) return { ok: false, erro: "Pedido inválido." };
  const resultado = await restaurarContestacao(id.data);
  revalidatePath("/admin", "layout");
  if (!resultado.ok) return { ok: false, erro: MENSAGEM_ERRO_RESTAURACAO[resultado.motivo] };
  return { ok: true, mensagem: "Pedido restaurado: downloads e lançamentos de volta." };
}
