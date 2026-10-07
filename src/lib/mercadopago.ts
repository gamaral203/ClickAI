// Cliente do Mercado Pago: Checkout Transparente via Orders (Pix e cartão), consulta de order,
// saque por Pix (Payouts) e validação da assinatura do webhook. Só roda no servidor: o access
// token nunca vai para o navegador.
//
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview
//       https://www.mercadopago.com.br/developers/pt/docs/payouts/overview

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const API = "https://api.mercadopago.com";

type Config = {
  accessToken: string;
  webhookSecret: string | null;
  producao: boolean;
};

/** Configuração lida do ambiente, ou `null` sem credenciais (aí o app usa o pagamento simulado). */
export function configMercadoPago(): Config | null {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return {
    accessToken,
    webhookSecret: process.env.MP_WEBHOOK_SECRET || null,
    producao: process.env.MP_AMBIENTE === "producao",
  };
}

export function mercadoPagoConfigurado() {
  return configMercadoPago() !== null;
}

function exigirConfig(): Config {
  const config = configMercadoPago();
  if (!config) throw new Error("MP_ACCESS_TOKEN não configurado");
  return config;
}

// ---------------------------------------------------------------- Valores

/** 1990 → "19.90", o formato de valor da API de Orders. */
export function centavosParaValor(centavos: number) {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

/** "19.90" ou "19.9" ou "19" → 1990. Sem ponto flutuante; `null` se não for um valor. */
export function valorParaCentavos(valor: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(valor.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

// ---------------------------------------------------------------- Requisições

export class ErroMercadoPago extends Error {
  constructor(
    readonly status: number,
    readonly corpo: unknown,
  ) {
    super(`Mercado Pago respondeu ${status}`);
  }
}

async function requisitar(
  caminho: string,
  init: { method: "GET" | "POST"; corpo?: unknown; idempotencia?: string; headers?: HeadersInit },
): Promise<unknown> {
  const { accessToken } = exigirConfig();
  const resposta = await fetch(`${API}${caminho}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.corpo !== undefined && { "Content-Type": "application/json" }),
      // Repetir a mesma chave devolve a mesma order/payout em vez de cobrar ou pagar de novo.
      ...(init.idempotencia && { "X-Idempotency-Key": init.idempotencia }),
      ...init.headers,
    },
    body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroMercadoPago(resposta.status, corpo);
  return corpo;
}

// ---------------------------------------------------------------- Orders (cobrança)

const pagamentoDaOrder = z.object({
  id: z.string().optional(),
  status: z.string(),
  status_detail: z.string().optional(),
  payment_method: z
    .object({
      qr_code: z.string().optional(),
      qr_code_base64: z.string().optional(),
    })
    .optional(),
});

const order = z.object({
  id: z.string(),
  status: z.string(),
  status_detail: z.string().optional(),
  external_reference: z.string().optional(),
  total_amount: z.string(),
  transactions: z.object({ payments: z.array(pagamentoDaOrder).default([]) }).optional(),
});

export type OrderMercadoPago = {
  id: string;
  status: string;
  statusDetalhe: string | null;
  referencia: string | null;
  totalCentavos: number | null;
  /** Processada e creditada: o dinheiro entrou. */
  paga: boolean;
  pix: { copiaECola: string; qrCodeBase64: string } | null;
};

function lerOrder(corpo: unknown): OrderMercadoPago {
  const o = order.parse(corpo);
  const pagamento = o.transactions?.payments[0];
  const qr = pagamento?.payment_method;
  return {
    id: o.id,
    status: o.status,
    statusDetalhe: o.status_detail ?? null,
    referencia: o.external_reference ?? null,
    totalCentavos: valorParaCentavos(o.total_amount),
    paga: o.status === "processed" && o.status_detail === "accredited",
    pix:
      qr?.qr_code && qr.qr_code_base64
        ? { copiaECola: qr.qr_code, qrCodeBase64: qr.qr_code_base64 }
        : null,
  };
}

type DadosCobranca = {
  /** Vai como `external_reference` e como chave de idempotência: um pedido, uma order. */
  pedidoId: string;
  totalCentavos: number;
  email: string;
};

/** Cria a order Pix. O QR Code vale 1 hora, o mesmo prazo do pedido pendente. */
export async function criarOrderPix(dados: DadosCobranca) {
  const valor = centavosParaValor(dados.totalCentavos);
  const corpo = await requisitar("/v1/orders", {
    method: "POST",
    idempotencia: `pix-${dados.pedidoId}`,
    corpo: {
      type: "online",
      processing_mode: "automatic",
      total_amount: valor,
      external_reference: dados.pedidoId,
      payer: { email: dados.email },
      transactions: {
        payments: [
          {
            amount: valor,
            payment_method: { id: "pix", type: "bank_transfer" },
            expiration_time: "PT1H",
          },
        ],
      },
    },
  });
  return lerOrder(corpo);
}

export type DadosCartao = {
  /** Token gerado pelo Card Payment Brick no navegador; o número do cartão nunca chega aqui. */
  token: string;
  bandeira: string;
  tipo: "credit_card" | "debit_card";
  documento: { tipo: string; numero: string } | null;
};

/** Cria a order no cartão, sempre à vista (1 parcela). */
export async function criarOrderCartao(dados: DadosCobranca & { cartao: DadosCartao }) {
  const valor = centavosParaValor(dados.totalCentavos);
  const corpo = await requisitar("/v1/orders", {
    method: "POST",
    // O token do cartão é de uso único; a chave inclui o token para uma nova tentativa (outro
    // cartão) não devolver a order recusada da tentativa anterior.
    idempotencia: `cartao-${dados.pedidoId}-${dados.cartao.token.slice(0, 32)}`,
    corpo: {
      type: "online",
      processing_mode: "automatic",
      total_amount: valor,
      external_reference: dados.pedidoId,
      payer: {
        email: dados.email,
        ...(dados.cartao.documento && {
          identification: {
            type: dados.cartao.documento.tipo,
            number: dados.cartao.documento.numero,
          },
        }),
      },
      transactions: {
        payments: [
          {
            amount: valor,
            payment_method: {
              id: dados.cartao.bandeira,
              type: dados.cartao.tipo,
              token: dados.cartao.token,
              installments: 1,
            },
          },
        ],
      },
    },
  });
  return lerOrder(corpo);
}

/** Lê a order direto na API: é o que vale, nunca o que veio no corpo do webhook ou do navegador. */
export async function buscarOrder(orderId: string) {
  return lerOrder(await requisitar(`/v1/orders/${encodeURIComponent(orderId)}`, { method: "GET" }));
}

// ---------------------------------------------------------------- Webhook

/**
 * Confere o `x-signature` da notificação. O manifesto é
 * `id:{data.id em minúsculas};request-id:{x-request-id};ts:{ts};`, assinado com HMAC-SHA256
 * pela chave secreta do webhook. Partes ausentes saem do manifesto.
 */
export function assinaturaDoWebhookConfere(entrada: {
  dataId: string | null;
  requestId: string | null;
  assinatura: string | null;
}): boolean {
  const { webhookSecret } = exigirConfig();
  if (!webhookSecret || !entrada.assinatura) return false;

  const partes = Object.fromEntries(
    entrada.assinatura.split(",").map((parte) => {
      const [chave, ...valor] = parte.split("=");
      return [chave.trim(), valor.join("=").trim()];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  const manifesto =
    (entrada.dataId ? `id:${entrada.dataId.toLowerCase()};` : "") +
    (entrada.requestId ? `request-id:${entrada.requestId};` : "") +
    `ts:${ts};`;
  const esperado = createHmac("sha256", webhookSecret).update(manifesto).digest();
  const recebido = Buffer.from(v1, "hex");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

// ---------------------------------------------------------------- Payouts (saque)

const payout = z.object({
  id: z.string(),
  status: z.string(),
  transactions: z.array(z.object({ status: z.string().optional() })).default([]),
});

export type SituacaoPayout = "processando" | "pago" | "falhou";

/** O saque nem foi enviado: em produção, falta a assinatura do Payouts. */
export class SaqueNaoHabilitado extends Error {
  constructor() {
    super("Saque em produção ainda não habilitado: falta a assinatura do Payouts");
  }
}

function situacaoDoPayout(corpo: unknown): { id: string; situacao: SituacaoPayout } {
  const p = payout.parse(corpo);
  const transacao = p.transactions[0]?.status;
  const situacao: SituacaoPayout =
    transacao === "success"
      ? "pago"
      : transacao === "error" || transacao === "canceled"
        ? "falhou"
        : "processando";
  return { id: p.id, situacao };
}

/** "00000000000" → "000.000.000-00"; 14 dígitos → "00.000.000/0000-00". */
function formatarChave(digitos: string) {
  return digitos.length === 11
    ? digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Envia o saque por Pix da conta da plataforma para a chave do fotógrafo (o CPF/CNPJ dele).
 * A chave de idempotência é o id do saque: repetir a chamada não paga duas vezes.
 */
export async function enviarPayoutPix(dados: {
  saqueId: string;
  liquidoCentavos: number;
  chavePix: string;
}) {
  const config = exigirConfig();
  if (config.producao) {
    // Em produção o Payouts exige o header X-signature, gerado com as chaves da integração.
    // A documentação pública não descreve o algoritmo; falta confirmar com o Mercado Pago
    // antes de liberar o saque real (docs/tarefas.md, Fase 13).
    throw new SaqueNaoHabilitado();
  }
  const valor = Number(centavosParaValor(dados.liquidoCentavos));
  const corpo = await requisitar("/v1/payouts", {
    method: "POST",
    idempotencia: dados.saqueId,
    headers: { "X-test-token": "true", "X-enforce-signature": "false" },
    corpo: {
      external_reference: dados.saqueId,
      description: "Saque ClicouAí",
      transactions: [
        {
          description: "Saque do fotógrafo",
          type: "pix",
          pix: {
            type: dados.chavePix.length === 11 ? "CPF" : "CNPJ",
            chave: formatarChave(dados.chavePix),
          },
          amount: { currency: "BRL", value: valor },
          external_reference: dados.saqueId,
        },
      ],
    },
  });
  return situacaoDoPayout(corpo);
}

export async function buscarPayout(payoutId: string) {
  const { producao } = exigirConfig();
  return situacaoDoPayout(
    await requisitar(`/v1/payouts/${encodeURIComponent(payoutId)}`, {
      method: "GET",
      headers: producao ? {} : { "X-test-token": "true" },
    }),
  );
}
