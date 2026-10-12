"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buscarPedido } from "@/dados";
import { formatarPreco } from "@/lib/formatar";
import { reembolsarPedido, restaurarContestacao } from "@/servicos/estornos";
import { conferirCobrancaDoPedido, type ConferenciaDoPedido } from "@/servicos/pagamentos";
import { exigirGestor } from "@/servicos/sessao";

// Reembolso, contestação e conferência de pagamento de pedidos: só o gestor. O valor nunca vem
// do navegador: o reembolso é sempre o total do pedido, e o Mercado Pago devolve o que foi
// cobrado na order; o pagamento só é confirmado pelo que a order lida na API diz.

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

const RESULTADO_CONFERENCIA: Record<ConferenciaDoPedido, ResultadoAcaoEstorno> = {
  pago: {
    ok: true,
    mensagem:
      "Pagamento confirmado no Mercado Pago: fotos liberadas e e-mail de entrega enviado ao comprador.",
  },
  pendente: {
    ok: true,
    mensagem: "O Mercado Pago ainda não registrou o pagamento desta cobrança.",
  },
  expirado: {
    ok: true,
    mensagem:
      "A cobrança venceu sem pagamento no Mercado Pago: o pedido expirou. O comprador precisa fazer um novo pedido.",
  },
  divergente: {
    ok: false,
    erro: "A cobrança consta como paga no Mercado Pago, mas não bate com o pedido (valor diferente, estorno ou contestação). Confira a order no Mercado Pago.",
  },
  nao_pendente: {
    ok: false,
    erro: "Este pedido já não está aguardando pagamento. Atualize a página.",
  },
  sem_cobranca: { ok: false, erro: "Este pedido não chegou a gerar a cobrança no Mercado Pago." },
  sem_gateway: { ok: false, erro: "O Mercado Pago não está configurado neste ambiente." },
  inexistente: { ok: false, erro: "Pedido não encontrado." },
  falhou: { ok: false, erro: "Não foi possível consultar o Mercado Pago. Tente de novo." },
};

/**
 * Pedido aguardando pagamento: lê a cobrança no Mercado Pago agora e aplica o resultado (o mesmo
 * caminho do webhook). Para o pagamento que chegou com o site fora do ar.
 */
export async function conferirPagamentoAcao(pedidoId: string): Promise<ResultadoAcaoEstorno> {
  await exigirGestor("/admin/vendas");
  const id = z.uuid().safeParse(pedidoId);
  if (!id.success) return { ok: false, erro: "Pedido inválido." };
  const resultado = await conferirCobrancaDoPedido(id.data);
  revalidatePath("/admin", "layout");
  return RESULTADO_CONFERENCIA[resultado];
}
