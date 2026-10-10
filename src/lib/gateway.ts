// Fachada do gateway de pagamento: hoje, o Mercado Pago (MP_ACCESS_TOKEN); sem ele, o pagamento
// é simulado (só fora da produção). Os serviços (pagamentos, estornos, saques, jobs) chamam só
// daqui, então trocar ou somar um gateway depois não mexe no resto do código.

import "server-only";

import { ErroGateway, type Cobranca, type ResultadoPayout } from "./gateway-tipos";
import {
  buscarOrder,
  buscarPayout,
  criarOrderPix,
  enviarPayoutPix,
  mercadoPagoConfigurado,
  recusaDoPayout,
  reembolsarOrder,
  reembolsoJaPedido,
} from "./mercadopago";

export { ErroGateway, SaqueNaoHabilitado } from "./gateway-tipos";
export type { Cobranca, ResultadoPayout, SituacaoCobranca } from "./gateway-tipos";

export type Provedor = "mercadopago";

/** O gateway em uso, ou `null` no pagamento simulado. */
export function provedorDePagamento(): Provedor | null {
  return mercadoPagoConfigurado() ? "mercadopago" : null;
}

export function gatewayConfigurado() {
  return provedorDePagamento() !== null;
}

// ---------------------------------------------------------------- Cobrança

export type DadosCobranca = {
  pedidoId: string;
  totalCentavos: number;
  nome: string;
  email: string;
};

export function criarCobrancaPix(dados: DadosCobranca): Promise<Cobranca> {
  return criarOrderPix({
    pedidoId: dados.pedidoId,
    totalCentavos: dados.totalCentavos,
    email: dados.email,
  });
}

export function buscarCobranca(id: string): Promise<Cobranca> {
  return buscarOrder(id);
}

/**
 * Cancela a cobrança de um pedido vencido; devolve se cancelou. No Mercado Pago não cancela
 * (`false`): o QR Code vence junto com o pedido e a order fica encerrada sozinha, e uma order
 * de cartão em análise não pode ser dada como perdida.
 */
export async function cancelarCobranca(id: string): Promise<boolean> {
  void id;
  return false;
}

export function reembolsarCobranca(id: string, pedidoId: string) {
  return reembolsarOrder(id, pedidoId);
}

/** O gateway recusou o reembolso porque ele já foi feito ou está em andamento. */
export function reembolsoJaFeito(erro: unknown) {
  return erro instanceof ErroGateway && reembolsoJaPedido(erro);
}

// ---------------------------------------------------------------- Saque

export function enviarSaquePix(dados: {
  saqueId: string;
  liquidoCentavos: number;
  chavePix: string;
}): Promise<ResultadoPayout> {
  return enviarPayoutPix(dados);
}

export function buscarSaque(gatewayId: string, saqueId: string): Promise<ResultadoPayout> {
  return buscarPayout(gatewayId, saqueId);
}

/** Recusa clara (o Pix certamente não saiu) ou ambígua (pode ter saído). */
export function recusaDoSaque(erro: ErroGateway): "clara" | "ambigua" {
  return recusaDoPayout(erro);
}
