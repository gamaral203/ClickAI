// Fachada do gateway de pagamento. O Asaas vale quando ASAAS_API_KEY existe; senão, o Mercado
// Pago (MP_ACCESS_TOKEN); sem nenhum dos dois, o pagamento é simulado (só fora da produção).
// Os serviços (pagamentos, estornos, saques, jobs) chamam só daqui, sem saber qual é.

import "server-only";

import {
  asaasConfigurado,
  buscarCobrancaAsaas,
  buscarTransferenciaAsaas,
  cancelarCobrancaAsaas,
  criarCobrancaCartaoAsaas,
  criarCobrancaPixAsaas,
  enviarTransferenciaPixAsaas,
  recusaDaTransferencia,
  reembolsarCobrancaAsaas,
  reembolsoJaPedidoAsaas,
  type DadosCobrancaAsaas,
} from "./asaas";
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

export type Provedor = "asaas" | "mercadopago";

/** O gateway em uso, ou `null` no pagamento simulado. */
export function provedorDePagamento(): Provedor | null {
  if (asaasConfigurado()) return "asaas";
  if (mercadoPagoConfigurado()) return "mercadopago";
  return null;
}

export function gatewayConfigurado() {
  return provedorDePagamento() !== null;
}

/** O checkout precisa pedir o CPF/CNPJ: o Asaas exige para cobrar. */
export function exigeCpfDoComprador() {
  return provedorDePagamento() === "asaas";
}

// ---------------------------------------------------------------- Cobrança

export type DadosCobranca = Omit<DadosCobrancaAsaas, "cpf"> & { cpf: string | null };

export async function criarCobrancaPix(dados: DadosCobranca): Promise<Cobranca> {
  if (provedorDePagamento() === "asaas") {
    if (!dados.cpf) throw new Error("CPF do comprador ausente: o Asaas exige para cobrar");
    return criarCobrancaPixAsaas({ ...dados, cpf: dados.cpf });
  }
  return criarOrderPix({
    pedidoId: dados.pedidoId,
    totalCentavos: dados.totalCentavos,
    email: dados.email,
  });
}

/** Só no Asaas: a cobrança no cartão é paga na página do Asaas (`urlPagamento`). */
export async function criarCobrancaCartaoRedirecionada(dados: DadosCobranca): Promise<Cobranca> {
  if (!dados.cpf) throw new Error("CPF do comprador ausente: o Asaas exige para cobrar");
  return criarCobrancaCartaoAsaas({ ...dados, cpf: dados.cpf });
}

export function buscarCobranca(id: string): Promise<Cobranca> {
  return provedorDePagamento() === "asaas" ? buscarCobrancaAsaas(id) : buscarOrder(id);
}

/**
 * Cancela a cobrança de um pedido vencido; devolve se cancelou. No Mercado Pago não cancela
 * (`false`): o QR Code vence junto com o pedido e a order fica encerrada sozinha, e uma order
 * de cartão em análise não pode ser dada como perdida.
 */
export async function cancelarCobranca(id: string): Promise<boolean> {
  return provedorDePagamento() === "asaas" ? cancelarCobrancaAsaas(id) : false;
}

export function reembolsarCobranca(id: string, pedidoId: string) {
  return provedorDePagamento() === "asaas"
    ? reembolsarCobrancaAsaas(id)
    : reembolsarOrder(id, pedidoId);
}

/** O gateway recusou o reembolso porque ele já foi feito ou está em andamento. */
export function reembolsoJaFeito(erro: unknown) {
  if (!(erro instanceof ErroGateway)) return false;
  return provedorDePagamento() === "asaas" ? reembolsoJaPedidoAsaas(erro) : reembolsoJaPedido(erro);
}

// ---------------------------------------------------------------- Saque

export function enviarSaquePix(dados: {
  saqueId: string;
  liquidoCentavos: number;
  chavePix: string;
}): Promise<ResultadoPayout> {
  return provedorDePagamento() === "asaas"
    ? enviarTransferenciaPixAsaas(dados)
    : enviarPayoutPix(dados);
}

export function buscarSaque(gatewayId: string, saqueId: string): Promise<ResultadoPayout> {
  return provedorDePagamento() === "asaas"
    ? buscarTransferenciaAsaas(gatewayId)
    : buscarPayout(gatewayId, saqueId);
}

/** Recusa clara (o Pix certamente não saiu) ou ambígua (pode ter saído). */
export function recusaDoSaque(erro: ErroGateway): "clara" | "ambigua" {
  return provedorDePagamento() === "asaas" ? recusaDaTransferencia(erro) : recusaDoPayout(erro);
}
