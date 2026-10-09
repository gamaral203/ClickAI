// Cliente do Mercado Pago: Checkout Transparente via Orders (Pix e cartão), consulta de order,
// saque por Pix (Payouts) e validação da assinatura do webhook. Só roda no servidor: o access
// token nunca vai para o navegador.
//
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview
//       https://www.mercadopago.com.br/developers/pt/docs/payouts/overview

import "server-only";

import { createHmac, createPrivateKey, sign, timingSafeEqual, type KeyObject } from "node:crypto";

import { z } from "zod";

import { erroMercadoPagoEmProducao, mercadoPagoFaltandoEmProducao } from "./ambiente-producao";
import {
  ErroGateway,
  SaqueNaoHabilitado,
  textosDoErro,
  type Cobranca,
  type ResultadoPayout,
  type SituacaoCobranca,
  type SituacaoPayout,
} from "./gateway-tipos";

export { SaqueNaoHabilitado, type ResultadoPayout, type SituacaoPayout };

const API = "https://api.mercadopago.com";

type Config = {
  accessToken: string;
  webhookSecret: string | null;
  producao: boolean;
};

/** Configuração lida do ambiente, ou `null` sem credenciais (aí o app usa o pagamento simulado). */
export function configMercadoPago(): Config | null {
  // Na produção, sem as duas variáveis, nada de cair no simulado: recusa (src/lib/ambiente-producao.ts).
  const faltando = mercadoPagoFaltandoEmProducao();
  if (faltando.length > 0) throw new Error(erroMercadoPagoEmProducao(faltando));
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

/** Resposta de erro do Mercado Pago (o corpo fica fora dos logs: src/lib/gateway-tipos.ts). */
export class ErroMercadoPago extends ErroGateway {
  constructor(status: number, corpo: unknown) {
    super(status, corpo, "Mercado Pago");
  }
}

async function requisitar(
  caminho: string,
  init: {
    method: "GET" | "POST";
    corpo?: unknown;
    /**
     * Corpo já serializado, enviado byte a byte como está. O Payouts assina exatamente estes
     * bytes: serializar de novo poderia mudar o texto e invalidar a assinatura.
     */
    corpoJson?: string;
    idempotencia?: string;
    headers?: Record<string, string>;
  },
): Promise<unknown> {
  const { accessToken } = exigirConfig();
  const body =
    init.corpoJson ?? (init.corpo === undefined ? undefined : JSON.stringify(init.corpo));
  const resposta = await fetch(`${API}${caminho}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body !== undefined && { "Content-Type": "application/json" }),
      // Repetir a mesma chave devolve a mesma order/payout em vez de cobrar ou pagar de novo.
      ...(init.idempotencia && { "X-Idempotency-Key": init.idempotencia }),
      ...init.headers,
    },
    body,
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

/**
 * O que a order diz sobre o dinheiro, lido de `status` + `status_detail`
 * (https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status):
 * - `paga`: `processed` + `accredited`;
 * - `reembolsada`: `refunded`, ou `processed` + `refunded`/`partially_refunded` (a resposta do
 *   reembolso traz `processed` + `refunded`). Reembolso parcial conta como total: a plataforma
 *   não repassa dinheiro que já devolveu, e o ClicouAí só faz reembolso total;
 * - `contestada`: `charged_back` + `in_process` (disputa aberta) ou qualquer detalhe novo;
 * - `contestacao_perdida`: `charged_back` + `settled` ou `reimbursed`. A documentação do Mercado
 *   Pago descreve os dois como dinheiro devolvido ao comprador; na dúvida, os dois encerram a
 *   disputa contra a plataforma (docs/arquitetura.md, "Estorno e chargeback");
 * - `outra`: o resto (criada, em processamento, aguardando pagamento, recusada, expirada…).
 */
export type SituacaoOrder = SituacaoCobranca;

const DETALHES_DE_REEMBOLSO = new Set(["refunded", "partially_refunded"]);
const DETALHES_DE_CONTESTACAO_PERDIDA = new Set(["settled", "reimbursed"]);

export function situacaoDaOrder(status: string, detalhe: string | null | undefined): SituacaoOrder {
  if (status === "charged_back") {
    return DETALHES_DE_CONTESTACAO_PERDIDA.has(detalhe ?? "")
      ? "contestacao_perdida"
      : "contestada";
  }
  if (status === "refunded") return "reembolsada";
  if (status === "processed" && DETALHES_DE_REEMBOLSO.has(detalhe ?? "")) return "reembolsada";
  if (status === "processed" && detalhe === "accredited") return "paga";
  return "outra";
}

export type OrderMercadoPago = Cobranca;

/** Status de order que não vão mais mudar para pago. */
const ORDER_ENCERRADA = new Set(["failed", "expired", "canceled", "cancelled", "refunded"]);

function lerOrder(corpo: unknown): OrderMercadoPago {
  const o = order.parse(corpo);
  const pagamento = o.transactions?.payments[0];
  const qr = pagamento?.payment_method;
  const situacao = situacaoDaOrder(o.status, o.status_detail);
  return {
    id: o.id,
    status: o.status,
    statusDetalhe: o.status_detail ?? null,
    referencia: o.external_reference ?? null,
    totalCentavos: valorParaCentavos(o.total_amount),
    paga: situacao === "paga",
    situacao,
    encerrada: ORDER_ENCERRADA.has(o.status),
    urlPagamento: null,
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

/**
 * Reembolso TOTAL da order (`POST /v1/orders/{id}/refund` com o corpo vazio). A chave de
 * idempotência é fixa por pedido: repetir o pedido de reembolso não devolve duas vezes. A
 * resposta não confirma nada sozinha: quem chama lê a order de novo com `buscarOrder`.
 */
export async function reembolsarOrder(orderId: string, pedidoId: string) {
  await requisitar(`/v1/orders/${encodeURIComponent(orderId)}/refund`, {
    method: "POST",
    idempotencia: `reembolso-${pedidoId}`,
  });
}

/** Códigos do Mercado Pago que dizem que o reembolso já foi feito ou já está em andamento. */
const REEMBOLSO_JA_PEDIDO = new Set(["order_already_refunded", "order_refund_already_in_process"]);

export function reembolsoJaPedido(erro: ErroMercadoPago) {
  const corpo = erro.corpo;
  if (!corpo || typeof corpo !== "object") return false;
  const textos: string[] = [];
  const visitar = (valor: unknown) => {
    if (!valor || typeof valor !== "object") return;
    const o = valor as Record<string, unknown>;
    for (const chave of ["code", "error"]) if (typeof o[chave] === "string") textos.push(o[chave]);
    if (Array.isArray(o.errors)) o.errors.forEach(visitar);
  };
  visitar(corpo);
  return textos.some((t) => REEMBOLSO_JA_PEDIDO.has(t.toLowerCase()));
}

// ---------------------------------------------------------------- Webhook

/**
 * Diferença máxima entre o `ts` assinado e o relógio do servidor, para o passado ou o futuro.
 * Uma notificação capturada não pode ser reenviada depois disso (ataque de repetição).
 */
export const TOLERANCIA_TS_WEBHOOK_MS = 5 * 60 * 1000;

/**
 * Confere o `x-signature` da notificação. O manifesto é
 * `id:{data.id em minúsculas};request-id:{x-request-id};ts:{ts};`, assinado com HMAC-SHA256
 * pela chave secreta do webhook. Partes ausentes saem do manifesto. O `ts` precisa estar a no
 * máximo 5 minutos do relógio do servidor (TOLERANCIA_TS_WEBHOOK_MS); o Mercado Pago manda em
 * milissegundos, mas um valor com até 10 dígitos é lido como segundos.
 */
export function assinaturaDoWebhookConfere(
  entrada: {
    dataId: string | null;
    requestId: string | null;
    assinatura: string | null;
  },
  agora = Date.now(),
): boolean {
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
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1) || !/^\d{1,16}$/.test(ts)) return false;
  const tsMs = ts.length <= 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(agora - tsMs) > TOLERANCIA_TS_WEBHOOK_MS) return false;

  const manifesto =
    (entrada.dataId ? `id:${entrada.dataId.toLowerCase()};` : "") +
    (entrada.requestId ? `request-id:${entrada.requestId};` : "") +
    `ts:${ts};`;
  const esperado = createHmac("sha256", webhookSecret).update(manifesto).digest();
  const recebido = Buffer.from(v1, "hex");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

// ---------------------------------------------------------------- Payouts (saque)
//
// Em produção, todo POST /v1/payouts leva `X-signature`: assinatura Ed25519 dos bytes exatos do
// corpo JSON enviado, em base64, feita com a chave privada da plataforma
// (MP_PAYOUTS_PRIVATE_KEY). A chave pública correspondente fica cadastrada no Mercado Pago
// (docs/mercadopago/payouts-chave-publica.pem). Como gerar e trocar a chave: docs/deploy.md.

type ConfigPayouts = { producao: false } | { producao: true; chave: KeyObject };

/** MP_PAYOUTS_PRIVATE_KEY: o PEM PKCS8 da chave Ed25519 codificado em base64 numa linha. */
export function lerChavePrivadaPayouts(valor: string): KeyObject {
  const texto = valor.trim();
  // Aceita também o PEM direto (com \n escritos como texto), mas o padrão é o base64.
  const pem = texto.includes("-----BEGIN")
    ? texto.replace(/\\n/g, "\n")
    : Buffer.from(texto, "base64").toString("utf8");
  const chave = createPrivateKey(pem);
  if (chave.asymmetricKeyType !== "ed25519") {
    throw new Error("MP_PAYOUTS_PRIVATE_KEY não é uma chave Ed25519");
  }
  return chave;
}

/**
 * Em teste, o Payouts roda sem assinatura. Em produção, só envia com a chave privada E com
 * MP_PAYOUTS_HABILITADO=1, ligado depois que o Mercado Pago confirmar o cadastro da chave
 * pública. Sem isso, recusa antes de chamar a API.
 */
export function configPayouts(): ConfigPayouts {
  const { producao } = exigirConfig();
  if (!producao) return { producao: false };
  const valor = process.env.MP_PAYOUTS_PRIVATE_KEY;
  if (!valor) {
    throw new SaqueNaoHabilitado("falta MP_PAYOUTS_PRIVATE_KEY, a chave que assina o Payouts");
  }
  if (process.env.MP_PAYOUTS_HABILITADO !== "1") {
    throw new SaqueNaoHabilitado(
      "MP_PAYOUTS_HABILITADO não está ligado (aguardando o Mercado Pago confirmar a chave pública)",
    );
  }
  try {
    return { producao: true, chave: lerChavePrivadaPayouts(valor) };
  } catch {
    throw new SaqueNaoHabilitado(
      "MP_PAYOUTS_PRIVATE_KEY inválida (esperado PEM Ed25519 em base64)",
    );
  }
}

/** Assinatura Ed25519 dos bytes UTF-8 do corpo, em base64 padrão: o valor do `X-signature`. */
export function assinarCorpoPayout(corpoJson: string, chave: KeyObject) {
  return sign(null, Buffer.from(corpoJson, "utf8"), chave).toString("base64");
}

/** Headers próprios do POST de payout: em teste, `X-test-token`; em produção, a assinatura. */
export function headersDoPayout(config: ConfigPayouts, corpoJson: string): Record<string, string> {
  if (!config.producao) return { "X-test-token": "true", "X-enforce-signature": "false" };
  return {
    "X-enforce-signature": "true",
    "X-signature": assinarCorpoPayout(corpoJson, config.chave),
  };
}

const id = z.union([z.string(), z.number()]).transform(String);

const transacaoPayout = z.object({
  id: id.optional(),
  status: z.string().optional(),
  status_detail: z.string().optional(),
  external_reference: z.string().optional(),
});

const respostaPayout = z.object({
  id,
  status: z.string().optional(),
  status_detail: z.string().optional(),
  transactions: z.array(transacaoPayout).optional(),
});

type TransacaoPayout = z.infer<typeof transacaoPayout>;

const DETALHES_DE_DEVOLUCAO = new Set(["refunded", "partially_refunded"]);

/** Status e detalhe da transação → o que fazer com o saque. Na dúvida, `processando`. */
export function situacaoDaTransacao(
  status: string | null | undefined,
  detalhe: string | null | undefined,
): SituacaoPayout {
  if (DETALHES_DE_DEVOLUCAO.has(status ?? "") || DETALHES_DE_DEVOLUCAO.has(detalhe ?? "")) {
    return "revisao";
  }
  switch (status) {
    case "success":
      // `success` + `in_progress` ainda não creditou.
      return detalhe === "accredited" ? "pago" : "processando";
    case "error":
    case "rejected":
    case "canceled":
    case "cancelled":
      return "falhou";
    default:
      // created, approved, transaction_in_process e qualquer status novo.
      return "processando";
  }
}

/** A transação do saque (pela referência) ou, sem ela, a primeira. */
function escolherTransacao(lista: TransacaoPayout[], referencia: string) {
  return lista.find((t) => t.external_reference === referencia) ?? lista[0] ?? null;
}

function resultado(payoutId: string, transacao: TransacaoPayout | null): ResultadoPayout {
  const status = transacao?.status ?? null;
  const detalhe = transacao?.status_detail ?? null;
  return {
    id: payoutId,
    transacaoId: transacao?.id ?? null,
    situacao: situacaoDaTransacao(status, detalhe),
    status,
    detalhe,
  };
}

/** `external_reference` da transação Pix: até 50 caracteres, só letras, números, - e _. */
export function referenciaDaTransacao(saqueId: string) {
  return `${saqueId}-pix`;
}

/** "00000000000" → "000.000.000-00"; 14 dígitos → "00.000.000/0000-00". */
function formatarChave(digitos: string) {
  return digitos.length === 11
    ? digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** Corpo do POST /v1/payouts. Descrições só com letras, números, espaços, - e _ (sem acento). */
export function corpoDoPayout(dados: {
  saqueId: string;
  liquidoCentavos: number;
  chavePix: string;
}) {
  return {
    external_reference: dados.saqueId,
    description: "Saque ClicouAi",
    transactions: [
      {
        description: "Saque do fotografo",
        type: "pix",
        pix: {
          type: dados.chavePix.length === 11 ? "CPF" : "CNPJ",
          chave: formatarChave(dados.chavePix),
        },
        amount: { currency: "BRL", value: Number(centavosParaValor(dados.liquidoCentavos)) },
        external_reference: referenciaDaTransacao(dados.saqueId),
      },
    ],
  };
}

/**
 * Envia o saque por Pix da conta da plataforma para a chave do fotógrafo (o CPF/CNPJ dele).
 * A chave de idempotência é o id do saque: repetir a chamada não paga duas vezes. O corpo é
 * serializado uma única vez, e esse mesmo texto é assinado e enviado.
 */
export async function enviarPayoutPix(dados: {
  saqueId: string;
  liquidoCentavos: number;
  chavePix: string;
}): Promise<ResultadoPayout> {
  const config = configPayouts();
  const corpoJson = JSON.stringify(corpoDoPayout(dados));
  const resposta = respostaPayout.parse(
    await requisitar("/v1/payouts", {
      method: "POST",
      idempotencia: dados.saqueId,
      corpoJson,
      headers: headersDoPayout(config, corpoJson),
    }),
  );
  const transacao =
    escolherTransacao(resposta.transactions ?? [], referenciaDaTransacao(dados.saqueId)) ??
    (resposta.status ? { status: resposta.status, status_detail: resposta.status_detail } : null);
  return resultado(resposta.id, transacao);
}

/** Lista de transações em qualquer dos formatos que a API pode devolver. */
function lerTransacoes(corpo: unknown): TransacaoPayout[] {
  if (Array.isArray(corpo)) return z.array(transacaoPayout).parse(corpo);
  if (corpo && typeof corpo === "object") {
    const objeto = corpo as Record<string, unknown>;
    const lista = ["results", "transactions", "data", "elements"]
      .map((chave) => objeto[chave])
      .find(Array.isArray);
    if (lista) return z.array(transacaoPayout).parse(lista);
    if ("status" in objeto) return [transacaoPayout.parse(objeto)];
  }
  return [];
}

/**
 * Situação do saque lida na API. `GET /v1/payouts/{id}` só traz o resumo, sem as transações;
 * o status do Pix vem de `GET /v1/payouts/{id}/transactions`.
 */
export async function buscarPayout(payoutId: string, saqueId: string): Promise<ResultadoPayout> {
  const { producao } = exigirConfig();
  const corpo = await requisitar(`/v1/payouts/${encodeURIComponent(payoutId)}/transactions`, {
    method: "GET",
    headers: producao ? {} : { "X-test-token": "true" },
  });
  return resultado(
    payoutId,
    escolherTransacao(lerTransacoes(corpo), referenciaDaTransacao(saqueId)),
  );
}

/** Códigos de erro que dizem, sem dúvida, que o payout foi recusado antes de existir. */
const RECUSAS_CLARAS = new Set([
  "invalid_signature",
  "signature_required",
  "idempotency_key_required",
  "invalid_token",
  "unauthorized",
  "forbidden",
  "validation_error",
]);

/** Indício de que o payout talvez já exista (referência ou chave repetida, conflito). */
const INDICIO_DE_DUPLICIDADE = /duplicat|already|exist|conflict|reference|in_use|repeat/i;

/**
 * Um 4xx do POST de payout é recusa CLARA (o Pix certamente não saiu: assinatura, token,
 * permissão, idempotência ausente, corpo inválido) ou AMBÍGUA (referência repetida, conflito,
 * código desconhecido: o payout pode já existir). Só a clara pode devolver o saldo.
 */
export function recusaDoPayout(erro: ErroMercadoPago): "clara" | "ambigua" {
  if (erro.status < 400 || erro.status >= 500 || erro.status === 409) return "ambigua";
  const { codigos, mensagens } = textosDoErro(erro.corpo);
  if ([...codigos, ...mensagens].some((t) => INDICIO_DE_DUPLICIDADE.test(t))) return "ambigua";
  if (erro.status === 401 || erro.status === 403) return "clara";
  if (codigos.some((c) => RECUSAS_CLARAS.has(c) || /^invalid_|_required$/.test(c))) return "clara";
  return "ambigua";
}
