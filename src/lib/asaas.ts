// Cliente do Asaas: cobrança Pix e cartão, consulta, cancelamento e reembolso de cobrança, saque
// por Pix (transferência) e conferência do token dos webhooks. Só roda no servidor: a chave da
// API nunca vai para o navegador.
//
// Cartão: o comprador paga na página da própria cobrança no Asaas (`invoiceUrl`), então o número
// do cartão nunca passa pelo ClicouAí. Pix: o QR Code é mostrado na página do pedido.
//
// Docs: https://docs.asaas.com/reference/criar-nova-cobranca
//       https://docs.asaas.com/docs/transferencia-para-contas-de-outra-instituicao-pix-ted
//       https://docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks

import "server-only";

import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { asaasFaltandoEmProducao, erroMercadoPagoEmProducao } from "./ambiente-producao";
import {
  ErroGateway,
  textosDoErro,
  type Cobranca,
  type ResultadoPayout,
  type SituacaoCobranca,
  type SituacaoPayout,
} from "./gateway-tipos";

type Config = { apiKey: string; webhookToken: string | null; producao: boolean };

/** Configuração lida do ambiente, ou `null` sem ASAAS_API_KEY. */
export function configAsaas(): Config | null {
  const faltando = asaasFaltandoEmProducao();
  if (faltando.length > 0) throw new Error(erroMercadoPagoEmProducao(faltando));
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || null,
    producao: process.env.ASAAS_AMBIENTE === "producao",
  };
}

export function asaasConfigurado() {
  return configAsaas() !== null;
}

function exigirConfig(): Config {
  const config = configAsaas();
  if (!config) throw new Error("ASAAS_API_KEY não configurada");
  return config;
}

function baseDaApi(config: Config) {
  return config.producao ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

// ---------------------------------------------------------------- Valores

/** 1990 → 19.9 (o Asaas usa número em reais). */
export function centavosParaReais(centavos: number) {
  return Math.round(centavos) / 100;
}

/** 19.9 → 1990, sem erro de arredondamento do ponto flutuante. */
export function reaisParaCentavos(valor: number) {
  return Math.round(valor * 100);
}

/** Data de hoje (YYYY-MM-DD) no horário de Brasília: o vencimento da cobrança. */
export function hojeEmBrasilia(agora = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// ---------------------------------------------------------------- Requisições

export class ErroAsaas extends ErroGateway {
  constructor(status: number, corpo: unknown) {
    super(status, corpo, "Asaas");
  }
}

async function requisitar(
  caminho: string,
  init: { method: "GET" | "POST" | "DELETE"; corpo?: unknown },
): Promise<unknown> {
  const config = exigirConfig();
  const resposta = await fetch(`${baseDaApi(config)}${caminho}`, {
    method: init.method,
    headers: {
      access_token: config.apiKey,
      Accept: "application/json",
      // O Asaas exige User-Agent nas contas novas.
      "User-Agent": "ClicouAi",
      ...(init.corpo !== undefined && { "Content-Type": "application/json" }),
    },
    body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroAsaas(resposta.status, corpo);
  return corpo;
}

// ---------------------------------------------------------------- Cliente (comprador)

const lista = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item).default([]) });
const clienteAsaas = z.object({ id: z.string() });

/**
 * O cliente do Asaas com este CPF/CNPJ: o já cadastrado ou um novo. As notificações do próprio
 * Asaas ficam desligadas: quem avisa o comprador é o ClicouAí.
 */
async function clienteDoComprador(comprador: { nome: string; email: string; cpf: string }) {
  const encontrados = lista(clienteAsaas).parse(
    await requisitar(`/customers?cpfCnpj=${encodeURIComponent(comprador.cpf)}&limit=1`, {
      method: "GET",
    }),
  );
  if (encontrados.data[0]) return encontrados.data[0].id;
  const criado = clienteAsaas.parse(
    await requisitar("/customers", {
      method: "POST",
      corpo: {
        name: comprador.nome,
        cpfCnpj: comprador.cpf,
        email: comprador.email,
        notificationDisabled: true,
      },
    }),
  );
  return criado.id;
}

// ---------------------------------------------------------------- Cobranças

const cobrancaAsaas = z.object({
  id: z.string(),
  status: z.string(),
  value: z.number(),
  externalReference: z.string().nullish(),
  invoiceUrl: z.string().nullish(),
  billingType: z.string().nullish(),
  deleted: z.boolean().nullish(),
});

const qrCodeAsaas = z.object({ encodedImage: z.string(), payload: z.string() });

const PAGA = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const REEMBOLSADA = new Set(["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"]);
const CONTESTADA = new Set([
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);
const ENCERRADA = new Set(["OVERDUE", "REFUNDED", "DELETED"]);

/**
 * Status da cobrança no Asaas → situação. `CONFIRMED` (cartão aprovado, dinheiro ainda não
 * disponível) já libera o pedido; o saque das vendas no cartão espera o prazo normal
 * (src/servicos/pedidos.ts). Chargeback perdido vira `REFUNDED` no Asaas, então cai em
 * `reembolsada`; quem chama sabe pelo pedido `contestado` que foi chargeback. Disputa ganha
 * aguardando repasse continua `contestada` até voltar a paga e o gestor restaurar.
 */
export function situacaoDaCobrancaAsaas(status: string): SituacaoCobranca {
  if (PAGA.has(status)) return "paga";
  if (REEMBOLSADA.has(status)) return "reembolsada";
  if (CONTESTADA.has(status)) return "contestada";
  return "outra";
}

function lerCobranca(
  corpo: unknown,
  pix: { copiaECola: string; qrCodeBase64: string } | null = null,
): Cobranca {
  const c = cobrancaAsaas.parse(corpo);
  const status = c.deleted ? "DELETED" : c.status;
  const situacao = situacaoDaCobrancaAsaas(status);
  return {
    id: c.id,
    status,
    statusDetalhe: null,
    referencia: c.externalReference ?? null,
    totalCentavos: reaisParaCentavos(c.value),
    paga: situacao === "paga",
    situacao,
    encerrada: ENCERRADA.has(status),
    pix,
    urlPagamento: c.invoiceUrl ?? null,
  };
}

export type DadosCobrancaAsaas = {
  /** Vai como `externalReference`: um pedido, uma cobrança. */
  pedidoId: string;
  totalCentavos: number;
  nome: string;
  email: string;
  /** CPF/CNPJ do comprador, só dígitos (o Asaas exige). */
  cpf: string;
};

/**
 * A cobrança já criada para o pedido, se houver. Faz as vezes da chave de idempotência (que o
 * Asaas não tem): repetir a criação devolve a cobrança existente em vez de cobrar duas vezes.
 */
async function cobrancaExistente(pedidoId: string, tipo: "PIX" | "CREDIT_CARD") {
  const encontradas = lista(cobrancaAsaas).parse(
    await requisitar(`/payments?externalReference=${encodeURIComponent(pedidoId)}&limit=10`, {
      method: "GET",
    }),
  );
  return encontradas.data.find((c) => c.billingType === tipo && !c.deleted) ?? null;
}

async function criarCobranca(dados: DadosCobrancaAsaas, tipo: "PIX" | "CREDIT_CARD") {
  const existente = await cobrancaExistente(dados.pedidoId, tipo);
  if (existente) return existente;
  const customer = await clienteDoComprador(dados);
  return cobrancaAsaas.parse(
    await requisitar("/payments", {
      method: "POST",
      corpo: {
        customer,
        billingType: tipo,
        value: centavosParaReais(dados.totalCentavos),
        dueDate: hojeEmBrasilia(),
        description: "Fotos do ClicouAí",
        externalReference: dados.pedidoId,
      },
    }),
  );
}

/** Cria a cobrança Pix e já busca o QR Code (copia e cola e imagem PNG em base64). */
export async function criarCobrancaPixAsaas(dados: DadosCobrancaAsaas): Promise<Cobranca> {
  const cobranca = await criarCobranca(dados, "PIX");
  const qr = qrCodeAsaas.parse(
    await requisitar(`/payments/${encodeURIComponent(cobranca.id)}/pixQrCode`, { method: "GET" }),
  );
  return lerCobranca(cobranca, { copiaECola: qr.payload, qrCodeBase64: qr.encodedImage });
}

/** Cria a cobrança no cartão; o comprador paga em `urlPagamento`, na página do Asaas. */
export async function criarCobrancaCartaoAsaas(dados: DadosCobrancaAsaas): Promise<Cobranca> {
  return lerCobranca(await criarCobranca(dados, "CREDIT_CARD"));
}

/** Lê a cobrança direto na API: é o que vale, nunca o corpo do webhook ou o navegador. */
export async function buscarCobrancaAsaas(id: string): Promise<Cobranca> {
  return lerCobranca(await requisitar(`/payments/${encodeURIComponent(id)}`, { method: "GET" }));
}

/**
 * Cancela a cobrança de um pedido que venceu sem pagamento (o Pix do Asaas vale até o fim do
 * dia; o pedido, só 1 hora). Devolve `false` se o Asaas recusou, por exemplo porque acabou de
 * ser paga: quem chama lê a cobrança de novo.
 */
export async function cancelarCobrancaAsaas(id: string): Promise<boolean> {
  try {
    await requisitar(`/payments/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  } catch (erro) {
    if (erro instanceof ErroAsaas && erro.status >= 400 && erro.status < 500) return false;
    throw erro;
  }
}

/** Reembolso total. Não confirma nada sozinho: quem chama lê a cobrança de novo. */
export async function reembolsarCobrancaAsaas(id: string) {
  await requisitar(`/payments/${encodeURIComponent(id)}/refund`, { method: "POST", corpo: {} });
}

/** O Asaas recusou o reembolso porque ele já foi feito ou está em andamento. */
export function reembolsoJaPedidoAsaas(erro: ErroGateway) {
  if (erro.status < 400 || erro.status >= 500) return false;
  const { mensagens } = textosDoErro(erro.corpo);
  return mensagens.some((m) => /estornad|reembolsad|refund/i.test(m));
}

// ---------------------------------------------------------------- Saque (transferência Pix)
//
// A transferência só sai depois que o Asaas pergunta ao ClicouAí, pelo webhook de validação de
// saque (src/app/api/webhooks/asaas/saque/route.ts), e o site aprova: aprova só uma
// transferência por saque, com o valor e a chave do saque. É isso que impede pagar duas vezes,
// já que a API de transferências não tem chave de idempotência.

const transferenciaAsaas = z.object({
  id: z.string(),
  status: z.string(),
  failReason: z.string().nullish(),
});

/** Status da transferência → o que fazer com o saque. Na dúvida, `processando`. */
export function situacaoDaTransferencia(status: string): SituacaoPayout {
  switch (status) {
    case "DONE":
      return "pago";
    case "FAILED":
    case "CANCELLED":
      return "falhou";
    default:
      // PENDING, BANK_PROCESSING, BLOCKED e qualquer status novo.
      return "processando";
  }
}

function resultadoTransferencia(corpo: unknown): ResultadoPayout {
  const t = transferenciaAsaas.parse(corpo);
  return {
    id: t.id,
    transacaoId: t.id,
    situacao: situacaoDaTransferencia(t.status),
    status: t.status,
    detalhe: t.failReason ?? null,
  };
}

export async function enviarTransferenciaPixAsaas(dados: {
  saqueId: string;
  liquidoCentavos: number;
  chavePix: string;
}): Promise<ResultadoPayout> {
  return resultadoTransferencia(
    await requisitar("/transfers", {
      method: "POST",
      corpo: {
        value: centavosParaReais(dados.liquidoCentavos),
        pixAddressKey: dados.chavePix,
        pixAddressKeyType: dados.chavePix.length === 11 ? "CPF" : "CNPJ",
        description: "Saque ClicouAi",
        externalReference: dados.saqueId,
      },
    }),
  );
}

export async function buscarTransferenciaAsaas(id: string): Promise<ResultadoPayout> {
  return resultadoTransferencia(
    await requisitar(`/transfers/${encodeURIComponent(id)}`, { method: "GET" }),
  );
}

/**
 * Recusa CLARA (a transferência certamente não foi criada: chave, permissão, saldo, corpo
 * inválido) ou AMBÍGUA (5xx, conflito, indício de duplicidade). Só a clara devolve o saldo.
 */
export function recusaDaTransferencia(erro: ErroGateway): "clara" | "ambigua" {
  if (erro.status < 400 || erro.status >= 500 || erro.status === 409) return "ambigua";
  const { codigos, mensagens } = textosDoErro(erro.corpo);
  if ([...codigos, ...mensagens].some((t) => /duplic|already|já existe/i.test(t))) {
    return "ambigua";
  }
  return "clara";
}

// ---------------------------------------------------------------- Webhooks

/** Confere o `asaas-access-token` dos webhooks contra ASAAS_WEBHOOK_TOKEN, em tempo constante. */
export function tokenDoWebhookConfere(recebido: string | null) {
  const { webhookToken } = exigirConfig();
  if (!webhookToken || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(webhookToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
