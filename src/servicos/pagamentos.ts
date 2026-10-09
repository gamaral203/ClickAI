import "server-only";

import { buscarPedido, ligarPedidoAoGateway, mudarStatusPedido, type PedidoInterno } from "@/dados";
import {
  buscarCobranca,
  cancelarCobranca,
  criarCobrancaCartaoRedirecionada,
  criarCobrancaPix,
  gatewayConfigurado,
  provedorDePagamento,
  type Cobranca,
} from "@/lib/gateway";
import { criarOrderCartao, type DadosCartao } from "@/lib/mercadopago";

import { aplicarEstornoDaOrder } from "./estornos";
import { buscarPedidoComAcesso, confirmarPagamento, type Credencial } from "./pedidos";

// Cobrança no gateway, Asaas ou Mercado Pago (docs/arquitetura.md, "Compra e pagamento"). O
// pedido só vira `pago` depois que o servidor lê a cobrança na API do gateway e confere a
// referência e o valor: pelo webhook, pela página do pedido ou logo depois de cobrar o cartão.
// Nunca pelo que o navegador diz.

/**
 * Aplica ao pedido o que a order diz. Confere que a order é a deste pedido e que o valor bate
 * com o total calculado pelo servidor; se não bater, não confirma (docs/riscos.md).
 */
async function aplicarOrder(order: Cobranca): Promise<"pago" | "pendente" | "ignorado"> {
  if (!order.referencia) return "ignorado";
  const encontrado = await buscarPedido(order.referencia);
  if (!encontrado) return "ignorado";
  const { pedido } = encontrado;
  if (pedido.gatewayId !== order.id) return "ignorado";

  // Reembolso ou chargeback: o status vem da order lida na API, nunca do corpo do webhook.
  if (await aplicarEstornoDaOrder(pedido, order)) return "ignorado";

  if (order.paga) {
    if (pedido.status === "contestado") {
      // Pode ser a contestação ganha ou um aviso antigo lido antes do chargeback: não restaura
      // sozinho. O gestor confere e restaura em /admin/vendas.
      console.warn("Order paga de pedido em contestação: revisar no /admin", { pedido: pedido.id });
      return "ignorado";
    }
    if (order.totalCentavos !== pedido.totalCentavos) {
      console.error("Order paga com valor diferente do pedido", {
        pedido: pedido.id,
        order: order.id,
      });
      return "ignorado";
    }
    await confirmarPagamento(pedido.id);
    return "pago";
  }

  const venceu = new Date(pedido.expiraEm).getTime() < Date.now();
  if (pedido.status === "pendente" && venceu) {
    // No Asaas o Pix vale até o fim do dia: cancela a cobrança antes de expirar o pedido. Se o
    // cancelamento for recusado (acabou de ser paga), a próxima leitura confirma o pagamento.
    if (order.encerrada || (await cancelarCobranca(order.id))) {
      await mudarStatusPedido(pedido.id, "pendente", "expirado");
    }
  }
  return "pendente";
}

/** Chamado pelo webhook: lê a cobrança na API (o corpo da notificação não vale) e aplica. */
export async function processarNotificacaoDeCobranca(cobrancaId: string) {
  return aplicarOrder(await buscarCobranca(cobrancaId));
}

/** Nome antigo, usado pelo webhook e pelos testes do Mercado Pago. */
export const processarNotificacaoDeOrder = processarNotificacaoDeCobranca;

// A página do pedido se atualiza a cada poucos segundos enquanto espera o Pix; sem este
// intervalo, cada atualização seria uma chamada ao gateway.
const ultimaConsulta = new Map<string, number>();
const INTERVALO_CONSULTA_MS = 5_000;

/**
 * Confere no Mercado Pago um pedido pendente com cobrança. Cobre o webhook que atrasou ou
 * nunca chegou (docs/riscos.md, prioridade alta) e o ambiente local, onde o Mercado Pago não
 * alcança o webhook.
 */
export async function sincronizarPedido(pedido: PedidoInterno) {
  if (pedido.status !== "pendente" || !pedido.gatewayId) return;
  const agora = Date.now();
  if (agora - (ultimaConsulta.get(pedido.id) ?? 0) < INTERVALO_CONSULTA_MS) return;
  ultimaConsulta.set(pedido.id, agora);
  try {
    await aplicarOrder(await buscarCobranca(pedido.gatewayId));
  } catch (erro) {
    // Falha na consulta não derruba a página: a próxima atualização tenta de novo.
    console.error("Falha ao consultar a cobrança no gateway", erro);
  }
}

/** Pedido com acesso conferido e já sincronizado com o Mercado Pago. */
export async function buscarPedidoAtualizado(pedidoId: string, credencial: Credencial) {
  const encontrado = await buscarPedidoComAcesso(pedidoId, credencial);
  if (!encontrado || !gatewayConfigurado()) return encontrado;
  if (encontrado.pedido.status !== "pendente" || !encontrado.pedido.gatewayId) return encontrado;
  await sincronizarPedido(encontrado.pedido);
  return buscarPedidoComAcesso(pedidoId, credencial);
}

/**
 * Gera o QR Code Pix de um pedido recém-criado. Se outra requisição já gerou, não gera outro
 * (a chave de idempotência também impede uma segunda order no Mercado Pago).
 */
export async function iniciarCobrancaPix(pedidoId: string): Promise<boolean> {
  const encontrado = await buscarPedido(pedidoId);
  if (!encontrado) return false;
  const { pedido } = encontrado;
  if (pedido.status !== "pendente" || pedido.metodo !== "pix") return false;
  if (pedido.gatewayId) return true;

  const order = await criarCobrancaPix({
    pedidoId: pedido.id,
    totalCentavos: pedido.totalCentavos,
    nome: pedido.nomeComprador,
    email: pedido.emailComprador,
    cpf: pedido.cpfComprador ?? null,
  });
  if (!order.pix) throw new Error(`Cobrança ${order.id} sem QR Code Pix`);
  await ligarPedidoAoGateway(pedido.id, null, order.id, order.pix);
  return true;
}

export type ResultadoCartao =
  | { ok: true; situacao: "aprovado" | "em_analise" }
  | { ok: false; motivo: "recusado" | "indisponivel" | "limite" };

/** Cobra o cartão de um pedido pendente. O valor é sempre o total do pedido no servidor. */
export async function pagarComCartao(
  pedidoId: string,
  credencial: Credencial,
  cartao: DadosCartao,
): Promise<ResultadoCartao> {
  const encontrado = await buscarPedidoComAcesso(pedidoId, credencial);
  if (!encontrado) return { ok: false, motivo: "indisponivel" };
  const { pedido } = encontrado;
  const venceu = new Date(pedido.expiraEm).getTime() < Date.now();
  if (pedido.status !== "pendente" || pedido.metodo !== "cartao" || venceu) {
    return { ok: false, motivo: "indisponivel" };
  }

  // Já existe uma order: só cobra de novo se a anterior foi recusada.
  if (pedido.gatewayId) {
    const anterior = await buscarCobranca(pedido.gatewayId);
    if (!anterior.encerrada) {
      const aplicado = await aplicarOrder(anterior);
      return aplicado === "pago"
        ? { ok: true, situacao: "aprovado" }
        : { ok: true, situacao: "em_analise" };
    }
  }

  const order = await criarOrderCartao({
    pedidoId: pedido.id,
    totalCentavos: pedido.totalCentavos,
    email: pedido.emailComprador,
    cartao,
  });
  const ligou = await ligarPedidoAoGateway(pedido.id, pedido.gatewayId, order.id, null);
  if (!ligou) return { ok: false, motivo: "indisponivel" };

  if (order.encerrada) return { ok: false, motivo: "recusado" };
  const aplicado = await aplicarOrder(order);
  return { ok: true, situacao: aplicado === "pago" ? "aprovado" : "em_analise" };
}

/**
 * Asaas: o cartão é pago na página da cobrança no Asaas. Cria a cobrança (ou reaproveita a do
 * pedido) e devolve o endereço para onde o navegador vai. O resultado chega pelo webhook e pela
 * página do pedido, que confere a cobrança na API.
 */
export async function iniciarPagamentoCartaoAsaas(
  pedidoId: string,
  credencial: Credencial,
): Promise<string | null> {
  if (provedorDePagamento() !== "asaas") return null;
  const encontrado = await buscarPedidoComAcesso(pedidoId, credencial);
  if (!encontrado) return null;
  const { pedido } = encontrado;
  const venceu = new Date(pedido.expiraEm).getTime() < Date.now();
  if (pedido.status !== "pendente" || pedido.metodo !== "cartao" || venceu) return null;

  if (pedido.gatewayId) {
    const atual = await buscarCobranca(pedido.gatewayId);
    if (!atual.encerrada) return atual.urlPagamento;
  }
  const cobranca = await criarCobrancaCartaoRedirecionada({
    pedidoId: pedido.id,
    totalCentavos: pedido.totalCentavos,
    nome: pedido.nomeComprador,
    email: pedido.emailComprador,
    cpf: pedido.cpfComprador ?? null,
  });
  const ligou = await ligarPedidoAoGateway(pedido.id, pedido.gatewayId, cobranca.id, null);
  return ligou ? cobranca.urlPagamento : null;
}
