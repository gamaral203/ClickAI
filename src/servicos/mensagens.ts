import "server-only";

import { registrarMensagem, type PedidoInterno } from "@/dados";
import { assinar, conferirAssinatura } from "@/lib/assinatura";
import { urlDoSite } from "@/lib/endereco";
import { formatarPreco } from "@/lib/formatar";

// Mensagens ao comprador (docs/arquitetura.md, "Compra e pagamento" e "Carrinho abandonado").
// O e-mail é sempre o canal principal; o WhatsApp só vai com o consentimento dado no checkout
// (docs/riscos.md: número bloqueado). Na Parte A o envio é simulado: a mensagem fica na caixa
// de saída que a equipe vê em /admin/mensagens. Na Fase 13, Resend e WhatsApp enviam de verdade.

/** O link da mensagem vale por 1 ano (a decisão do prazo de acesso está em aberto). */
const VALIDADE_LINK_PEDIDO_MS = 365 * 24 * 60 * 60 * 1000;
const VALIDADE_LINK_RECUPERAR_MS = 30 * 24 * 60 * 60 * 1000;
const PROPOSITO_PEDIDO = "acesso-pedido";
const PROPOSITO_RECUPERAR = "recuperar-carrinho";

/**
 * Link para a página do pedido, assinado pelo servidor. O pedido guarda só o hash do token
 * original, então a mensagem leva um link próprio, que a página aceita no lugar do token.
 */
export function linkDoPedido(pedidoId: string) {
  const token = assinar(PROPOSITO_PEDIDO, { p: pedidoId }, VALIDADE_LINK_PEDIDO_MS);
  return urlDoSite(`/pedidos/${pedidoId}?token=${token}`);
}

/** O token é um link de mensagem válido para este pedido? */
export function linkDoPedidoConfere(pedidoId: string, token: string) {
  const dados = conferirAssinatura(PROPOSITO_PEDIDO, token) as { p?: unknown } | null;
  return dados?.p === pedidoId;
}

/** Link que remonta o carrinho de um pedido que expirou sem pagamento. */
export function linkParaRecuperar(pedidoId: string) {
  const token = assinar(PROPOSITO_RECUPERAR, { p: pedidoId }, VALIDADE_LINK_RECUPERAR_MS);
  return urlDoSite(`/carrinho/recuperar?token=${token}`);
}

/** Pedido do link de recuperação, ou `null` se o link foi alterado ou venceu. */
export function pedidoDoLinkParaRecuperar(token: string): string | null {
  const dados = conferirAssinatura(PROPOSITO_RECUPERAR, token) as { p?: unknown } | null;
  return typeof dados?.p === "string" ? dados.p : null;
}

async function enviar(
  pedido: PedidoInterno,
  tipo: "entrega" | "lembrete",
  assunto: string,
  texto: string,
) {
  await registrarMensagem({
    pedidoId: pedido.id,
    canal: "email",
    tipo,
    para: pedido.emailComprador,
    assunto,
    texto,
  });
  if (pedido.aceitaWhatsapp && pedido.whatsapp) {
    await registrarMensagem({
      pedidoId: pedido.id,
      canal: "whatsapp",
      tipo,
      para: pedido.whatsapp,
      assunto,
      texto,
    });
  }
}

/** Depois do pagamento: o link para baixar os originais. */
export async function enviarEntrega(pedido: PedidoInterno) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  await enviar(
    pedido,
    "entrega",
    "Suas fotos estão prontas para baixar",
    `Olá, ${primeiroNome}! Recebemos o pagamento de ${formatarPreco(pedido.totalCentavos)}. ` +
      `Baixe os originais em alta resolução por este link: ${linkDoPedido(pedido.id)}`,
  );
}

/** Pedido que expirou sem pagamento: convida a refazer a compra. */
export async function enviarLembrete(pedido: PedidoInterno) {
  const primeiroNome = pedido.nomeComprador.split(" ")[0];
  await enviar(
    pedido,
    "lembrete",
    "Suas fotos ainda estão esperando por você",
    `Olá, ${primeiroNome}! O pagamento do seu pedido não chegou e ele expirou. ` +
      `As fotos continuam disponíveis: refaça a compra por este link: ${linkParaRecuperar(pedido.id)}`,
  );
}
