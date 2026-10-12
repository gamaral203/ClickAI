// Pix pago que ficava "pendente": webhook do Mercado Pago (assinatura, status processed +
// accredited, idempotência) e a reconciliação do job de pedidos, que confere no Mercado Pago
// todo pendente com cobrança, no prazo ou vencido, pelo mesmo caminho do webhook.

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/webhooks/mercadopago/route";
import {
  buscarPedido,
  ligarPedidoAoGateway,
  listarMensagens,
  salvarPedido,
  type ItemPedido,
  type PedidoInterno,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { assinaturaDoWebhookConfere } from "@/lib/mercadopago";

import { rodarJobDePedidos } from "./jobs";

const SEGREDO = "segredo-do-webhook-de-teste";

// ---------------------------------------------------------------- Mercado Pago simulado por fetch

type OrderFalsa = {
  pedidoId: string;
  status: string;
  status_detail: string;
  total_amount?: string;
};
const orders = new Map<string, OrderFalsa>();
let leituras: string[] = [];
let respostaForcada: (() => Response) | null = null;

function ligarMercadoPago() {
  vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
  vi.stubEnv("MP_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("MP_AMBIENTE", "teste");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const m = /\/v1\/orders\/([^/]+)$/.exec(url);
      if (!m) return new Response("{}", { status: 404 });
      const id = decodeURIComponent(m[1]);
      leituras.push(id);
      if (respostaForcada) return respostaForcada();
      const order = orders.get(id);
      if (!order) return new Response("{}", { status: 404 });
      const valor = order.total_amount ?? "20.00";
      // Formato da resposta de GET /v1/orders/{id} de um Pix.
      return new Response(
        JSON.stringify({
          id,
          type: "online",
          processing_mode: "automatic",
          external_reference: order.pedidoId,
          total_amount: valor,
          total_paid_amount: order.status === "processed" ? valor : "0.00",
          status: order.status,
          status_detail: order.status_detail,
          transactions: {
            payments: [
              {
                id: `PAY${id.slice(3)}`,
                amount: valor,
                status: order.status,
                status_detail: order.status_detail,
                payment_method: {
                  id: "pix",
                  type: "bank_transfer",
                  qr_code: "000201...",
                  qr_code_base64: "iVBOR...",
                },
              },
            ],
          },
        }),
        { status: 200 },
      );
    }),
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  leituras = [];
  respostaForcada = null;
  ligarMercadoPago();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- Pedidos de teste

function novoOrderId() {
  return `ORD${randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase()}`;
}

/** Pedido Pix pendente com dois itens de R$ 10,00, ligado a uma order do Mercado Pago. */
async function pedidoPix(parcial: Partial<PedidoInterno> = {}) {
  const banco = await obterBanco();
  const fotos = await banco
    .select({ id: t.fotos.id, autor: t.fotos.enviadaPor })
    .from(t.fotos)
    .where(and(eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm)))
    .limit(2);
  expect(fotos).toHaveLength(2);
  const id = randomUUID();
  const itens: ItemPedido[] = fotos.map((f) => ({
    id: randomUUID(),
    pedidoId: id,
    fotoId: f.id,
    fotografoId: f.autor,
    precoCentavos: 1000,
    descontoCentavos: 0,
    valorFotografoCentavos: 1000,
    valorDonoEventoCentavos: 0,
    viaPacote: false,
  }));
  await salvarPedido(
    {
      id,
      clienteId: null,
      emailComprador: `${id}@exemplo.com`,
      nomeComprador: "Ana Teste",
      whatsapp: null,
      aceitaWhatsapp: false,
      cupomId: null,
      subtotalCentavos: 2000,
      descontoCentavos: 0,
      totalCentavos: 2000,
      metodo: "pix",
      status: "pendente",
      // Criado há 25 minutos, Pix ainda no prazo (vale 1 hora).
      expiraEm: new Date(Date.now() + 35 * 60_000).toISOString(),
      pagoEm: null,
      criadoEm: new Date(Date.now() - 25 * 60_000).toISOString(),
      tokenAcessoHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      acessoExpiraEm: null,
      gatewayId: null,
      pix: null,
      lembreteEnviadoEm: null,
      ...parcial,
    },
    itens,
  );
  const orderId = novoOrderId();
  const pix = { copiaECola: "000201...", qrCodeBase64: "iVBOR..." };
  expect(await ligarPedidoAoGateway(id, null, orderId, pix)).toBe(true);
  orders.set(orderId, {
    pedidoId: id,
    status: "action_required",
    status_detail: "waiting_transfer",
  });
  return { id, orderId, itens };
}

async function statusDo(pedidoId: string) {
  return (await buscarPedido(pedidoId))?.pedido.status;
}

async function lancamentosDo(itens: ItemPedido[]) {
  const banco = await obterBanco();
  return banco
    .select()
    .from(t.lancamentos)
    .where(
      inArray(
        t.lancamentos.itemPedidoId,
        itens.map((i) => i.id),
      ),
    );
}

const pagar = (orderId: string) => {
  const order = orders.get(orderId);
  if (!order) throw new Error("order inexistente");
  orders.set(orderId, { ...order, status: "processed", status_detail: "accredited" });
};

// ---------------------------------------------------------------- Webhook

/** Notificação de order como o Mercado Pago manda: id na query, assinatura no header. */
function notificacao(orderId: string, opcoes: { segredo?: string; idNaAssinatura?: string } = {}) {
  const ts = String(Date.now());
  const requestId = randomUUID();
  const idAssinado = (opcoes.idNaAssinatura ?? orderId).toLowerCase();
  const manifesto = `id:${idAssinado};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", opcoes.segredo ?? SEGREDO)
    .update(manifesto)
    .digest("hex");
  const order = orders.get(orderId);
  return new NextRequest(
    `https://www.clicouai.com/api/webhooks/mercadopago?data.id=${orderId}&type=order`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${v1}`,
      },
      // Corpo no formato da documentação do webhook de Orders. O status daqui é ignorado: vale
      // o da order lida na API.
      body: JSON.stringify({
        action: "order.processed",
        api_version: "v1",
        application_id: "1234567890",
        date_created: new Date().toISOString(),
        id: "123456",
        live_mode: true,
        type: "order",
        user_id: 123,
        data: {
          external_reference: order?.pedidoId,
          id: orderId,
          status: "processed",
          status_detail: "accredited",
          total_paid_amount: "20.00",
          version: 3,
        },
      }),
    },
  );
}

describe("assinatura do webhook (x-signature)", () => {
  it("usa o data.id da order em minúsculas no manifesto, como manda a documentação", () => {
    // Id de order do exemplo da documentação do Mercado Pago.
    const dataId = "ORD01M28P44G5FG8RJPM579EH56FV";
    const ts = String(Date.now());
    const requestId = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
    const assinar = (id: string) =>
      createHmac("sha256", SEGREDO)
        .update(`id:${id};request-id:${requestId};ts:${ts};`)
        .digest("hex");

    const certa = `ts=${ts},v1=${assinar(dataId.toLowerCase())}`;
    expect(assinaturaDoWebhookConfere({ dataId, requestId, assinatura: certa })).toBe(true);
    // Assinado com o id em maiúsculas: não é o que o Mercado Pago faz, então não confere.
    const errada = `ts=${ts},v1=${assinar(dataId)}`;
    expect(assinaturaDoWebhookConfere({ dataId, requestId, assinatura: errada })).toBe(false);
  });
});

describe("webhook de order", () => {
  it("confirma o Pix processed + accredited, uma vez só, mesmo com aviso repetido", async () => {
    const { id, orderId, itens } = await pedidoPix();
    pagar(orderId);

    expect((await POST(notificacao(orderId))).status).toBe(200);
    expect(await statusDo(id)).toBe("pago");
    const lancamentos = await lancamentosDo(itens);
    expect(lancamentos.length).toBeGreaterThan(0);

    // O Mercado Pago reenvia: nada muda e nenhum lançamento a mais.
    expect((await POST(notificacao(orderId))).status).toBe(200);
    expect(await statusDo(id)).toBe("pago");
    expect(await lancamentosDo(itens)).toHaveLength(lancamentos.length);
  });

  it("não confirma pelo corpo: a order ainda aguardando a transferência fica pendente", async () => {
    const { id, orderId } = await pedidoPix();
    // O corpo diz processed/accredited, mas a API diz action_required/waiting_transfer.
    expect((await POST(notificacao(orderId))).status).toBe(200);
    expect(await statusDo(id)).toBe("pendente");
    expect(leituras).toContain(orderId);
  });

  it("recusa assinatura com outra chave e não lê a order", async () => {
    const { id, orderId } = await pedidoPix();
    pagar(orderId);
    expect((await POST(notificacao(orderId, { segredo: "outra-chave" }))).status).toBe(401);
    expect(await statusDo(id)).toBe("pendente");
    expect(leituras).not.toContain(orderId);
  });

  it("não confirma order paga com valor diferente do pedido", async () => {
    const { id, orderId } = await pedidoPix();
    pagar(orderId);
    orders.set(orderId, { ...orders.get(orderId)!, total_amount: "0.01" });
    expect((await POST(notificacao(orderId))).status).toBe(200);
    expect(await statusDo(id)).toBe("pendente");
  });
});

// ---------------------------------------------------------------- Job: reconciliação

describe("job de pedidos: reconciliação no Mercado Pago", () => {
  it("confirma o Pix pago ainda no prazo sem webhook e não manda o lembrete do Pix", async () => {
    const { id, orderId, itens } = await pedidoPix();
    const aguardando = await pedidoPix();
    pagar(orderId);

    const resultado = await rodarJobDePedidos();
    expect(resultado.pagos).toBeGreaterThanOrEqual(1);
    expect(leituras).toEqual(expect.arrayContaining([orderId, aguardando.orderId]));
    expect(await statusDo(id)).toBe("pago");
    expect(await statusDo(aguardando.id)).toBe("pendente");

    const mensagens = (await listarMensagens(1000)).filter((m) => m.pedidoId === id);
    expect(mensagens.some((m) => m.tipo === "lembrete_pix")).toBe(false);
    expect(mensagens.some((m) => m.tipo === "entrega")).toBe(true);

    // Rodar de novo não confirma duas vezes.
    const quantos = (await lancamentosDo(itens)).length;
    await rodarJobDePedidos();
    expect(await statusDo(id)).toBe("pago");
    expect(await lancamentosDo(itens)).toHaveLength(quantos);
  });

  it("confirma o pago vencido em vez de expirar e expira só a order encerrada", async () => {
    const vencido = { expiraEm: new Date(Date.now() - 60_000).toISOString() };
    const pago = await pedidoPix(vencido);
    const expirado = await pedidoPix(vencido);
    pagar(pago.orderId);
    orders.set(expirado.orderId, {
      pedidoId: expirado.id,
      status: "expired",
      status_detail: "expired",
    });

    await rodarJobDePedidos();
    expect(await statusDo(pago.id)).toBe("pago");
    expect(await statusDo(expirado.id)).toBe("expirado");
  });

  it("com o Mercado Pago limitando (429), para depois de 3 falhas e não expira nada", async () => {
    const vencido = await pedidoPix({ expiraEm: new Date(Date.now() - 60_000).toISOString() });
    await pedidoPix();
    await pedidoPix();
    await pedidoPix();
    respostaForcada = () => new Response(JSON.stringify({ message: "too many" }), { status: 429 });

    const resultado = await rodarJobDePedidos();
    expect(leituras).toHaveLength(3);
    expect(resultado.pagos).toBe(0);
    expect(await statusDo(vencido.id)).toBe("pendente");
  });
});
