import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buscarPedido,
  ligarPedidoAoGateway,
  mudarStatusSaque,
  reservarLancamentosParaSaque,
  salvarPedido,
  type ItemPedido,
  type PedidoInterno,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { situacaoDaOrder } from "@/lib/mercadopago";

import { autorizarDownload } from "./downloads";
import { reembolsarPedido, restaurarContestacao } from "./estornos";
import { processarNotificacaoDeOrder } from "./pagamentos";
import { confirmarPagamento } from "./pedidos";
import { calcularSaque } from "./saques";

const GESTOR = { id: "05e70000-0000-4000-8000-000000000005" };

/** Duas fotos prontas de exemplo (com original de exemplo, que baixa fora da produção). */
async function fotosDeExemplo() {
  const banco = await obterBanco();
  const fotos = await banco
    .select({ id: t.fotos.id, autor: t.fotos.enviadaPor })
    .from(t.fotos)
    .where(and(eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm)))
    .limit(2);
  expect(fotos).toHaveLength(2);
  return fotos;
}

/** Pedido pendente com dois itens de R$ 10,00, e o token de acesso do convidado. */
async function criarPedidoDeTeste(gatewayId: string | null = null) {
  const fotos = await fotosDeExemplo();
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
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
  const pedido: PedidoInterno = {
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
    metodo: "cartao",
    status: "pendente",
    expiraEm: new Date(Date.now() + 60 * 60_000).toISOString(),
    pagoEm: null,
    criadoEm: new Date().toISOString(),
    tokenAcessoHash: createHash("sha256").update(token).digest("hex"),
    acessoExpiraEm: null,
    gatewayId: null,
    pix: null,
    lembreteEnviadoEm: null,
  };
  await salvarPedido(pedido, itens);
  if (gatewayId) expect(await ligarPedidoAoGateway(id, null, gatewayId, null)).toBe(true);
  return { id, token, itens };
}

async function lancamentosDoPedido(pedidoId: string) {
  const banco = await obterBanco();
  const itens = await banco
    .select({ id: t.itensPedido.id })
    .from(t.itensPedido)
    .where(eq(t.itensPedido.pedidoId, pedidoId));
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

const soma = (lista: { valorCentavos: number }[]) => lista.reduce((s, l) => s + l.valorCentavos, 0);

async function statusDo(pedidoId: string) {
  return (await buscarPedido(pedidoId))?.pedido.status;
}

// ---------------------------------------------------------------- Mercado Pago simulado por fetch

type OrderFalsa = { status: string; status_detail: string; total_amount?: string };
const orders = new Map<string, OrderFalsa & { pedidoId: string }>();
let chamadas: { url: string; method: string; idempotencia: string | null }[] = [];
let respostaDoReembolso: () => Response = () => new Response("{}", { status: 201 });

function ligarMercadoPago() {
  vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
  vi.stubEnv("MP_AMBIENTE", "teste");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      chamadas.push({
        url,
        method: init.method ?? "GET",
        idempotencia: headers.get("X-Idempotency-Key"),
      });
      const m = /\/v1\/orders\/([^/]+)(\/refund)?$/.exec(url);
      const order = m && orders.get(decodeURIComponent(m[1]));
      if (!m || !order) return new Response("{}", { status: 404 });
      if (m[2]) return respostaDoReembolso();
      return new Response(
        JSON.stringify({
          id: m[1],
          status: order.status,
          status_detail: order.status_detail,
          external_reference: order.pedidoId,
          total_amount: order.total_amount ?? "20.00",
        }),
        { status: 200 },
      );
    }),
  );
}

/** Pedido pago por uma order (confirmado pela leitura da order, como no webhook). */
async function pedidoPagoNoMercadoPago() {
  const orderId = `ORD${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
  const pedido = await criarPedidoDeTeste(orderId);
  orders.set(orderId, { pedidoId: pedido.id, status: "processed", status_detail: "accredited" });
  expect(await processarNotificacaoDeOrder(orderId)).toBe("pago");
  return { ...pedido, orderId };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  orders.clear();
  chamadas = [];
  respostaDoReembolso = () => new Response("{}", { status: 201 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- Testes

describe("situação da order", () => {
  it("separa pago, reembolso, contestação aberta e perdida", () => {
    expect(situacaoDaOrder("processed", "accredited")).toBe("paga");
    expect(situacaoDaOrder("refunded", "refunded")).toBe("reembolsada");
    expect(situacaoDaOrder("processed", "refunded")).toBe("reembolsada");
    expect(situacaoDaOrder("processed", "partially_refunded")).toBe("reembolsada");
    expect(situacaoDaOrder("charged_back", "in_process")).toBe("contestada");
    expect(situacaoDaOrder("charged_back", "detalhe_novo")).toBe("contestada");
    expect(situacaoDaOrder("charged_back", "settled")).toBe("contestacao_perdida");
    expect(situacaoDaOrder("charged_back", "reimbursed")).toBe("contestacao_perdida");
    expect(situacaoDaOrder("action_required", "waiting_payment")).toBe("outra");
  });
});

describe("reembolso pelo gestor (gateway simulado)", () => {
  it("estorna, bloqueia o download e lança o negativo de cada venda, uma vez só", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    const { id, token, itens } = await criarPedidoDeTeste();
    expect(await confirmarPagamento(id)).toBe(true);
    expect(await autorizarDownload(itens[0].id, { token }, null)).not.toBeNull();

    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: true, situacao: "estornado" });
    const pedido = (await buscarPedido(id))?.pedido;
    expect(pedido?.status).toBe("estornado");
    expect(pedido?.motivoEstorno).toBe("reembolso");
    expect(await autorizarDownload(itens[0].id, { token }, null)).toBeNull();

    const lancamentos = await lancamentosDoPedido(id);
    expect(lancamentos).toHaveLength(4);
    expect(soma(lancamentos)).toBe(0);
    for (const negativo of lancamentos.filter((l) => l.valorCentavos < 0)) {
      const original = lancamentos.find((l) => l.id === negativo.estornoDe);
      // Venda ainda não sacada: o estorno anula no mesmo prazo.
      expect(original?.valorCentavos).toBe(-negativo.valorCentavos);
      expect(negativo.disponivelEm.getTime()).toBe(original?.disponivelEm.getTime());
    }

    // Repetir o reembolso não lança de novo.
    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: true, situacao: "estornado" });
    expect(await lancamentosDoPedido(id)).toHaveLength(4);
  });

  it("recusa pedido que não está pago", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    const { id } = await criarPedidoDeTeste();
    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: false, motivo: "nao_pago" });
    expect(await statusDo(id)).toBe("pendente");
  });

  it("venda já sacada: não mexe no saque e o negativo é abatido do próximo", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    const { id, itens } = await criarPedidoDeTeste();
    await confirmarPagamento(id);
    const [venda] = (await lancamentosDoPedido(id)).filter((l) => l.itemPedidoId === itens[0].id);
    const saqueId = randomUUID();
    expect(
      await reservarLancamentosParaSaque(
        {
          id: saqueId,
          fotografoId: venda.fotografoId,
          antecipado: true,
          brutoCentavos: venda.valorCentavos,
          taxaCentavos: 110,
          liquidoCentavos: venda.valorCentavos - 110,
          chavePix: "12345678909",
          gatewayId: null,
          status: "processando",
          criadoEm: new Date().toISOString(),
          pagoEm: null,
        },
        [venda.id],
      ),
    ).toBe(true);
    await mudarStatusSaque(saqueId, "processando", "pago", { pagoEm: new Date().toISOString() });

    const antes = Date.now();
    await reembolsarPedido(GESTOR, id);

    const banco = await obterBanco();
    const [saque] = await banco.select().from(t.saques).where(eq(t.saques.id, saqueId));
    expect(saque.status).toBe("pago");
    const [vendaDepois] = await banco
      .select()
      .from(t.lancamentos)
      .where(eq(t.lancamentos.id, venda.id));
    expect(vendaDepois.saqueId).toBe(saqueId);

    const [negativo] = await banco
      .select()
      .from(t.lancamentos)
      .where(eq(t.lancamentos.estornoDe, venda.id));
    expect(negativo.valorCentavos).toBe(-venda.valorCentavos);
    expect(negativo.saqueId).toBeNull();
    // Disponível na hora: entra (negativo) no próximo saque, normal ou antecipado.
    expect(negativo.disponivelEm.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    const calculo = calcularSaque(
      [
        {
          id: negativo.id,
          valorCentavos: negativo.valorCentavos,
          disponivelEm: negativo.disponivelEm.toISOString(),
          antecipavelEm: negativo.antecipavelEm.toISOString(),
        },
      ],
      Date.now() + 1000,
      10,
      false,
    );
    expect(calculo.lancamentoIds).toEqual([negativo.id]);
    expect(calculo.brutoCentavos).toBe(-venda.valorCentavos);
  });
});

describe("reembolso pelo gestor (Mercado Pago)", () => {
  it("pede o reembolso total com chave fixa e estorna pela order lida na API", async () => {
    ligarMercadoPago();
    const { id, orderId, token, itens } = await pedidoPagoNoMercadoPago();
    respostaDoReembolso = () => {
      orders.set(orderId, { pedidoId: id, status: "processed", status_detail: "refunded" });
      return new Response("{}", { status: 201 });
    };

    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: true, situacao: "estornado" });
    const reembolso = chamadas.find((c) => c.url.endsWith("/refund"));
    expect(reembolso).toMatchObject({ method: "POST", idempotencia: `reembolso-${id}` });
    expect(await statusDo(id)).toBe("estornado");
    expect(await autorizarDownload(itens[0].id, { token }, null)).toBeNull();
    expect(soma(await lancamentosDoPedido(id))).toBe(0);
  });

  it("reembolso ainda em andamento: downloads param e o pedido espera a order", async () => {
    ligarMercadoPago();
    const { id, token, itens } = await pedidoPagoNoMercadoPago();
    // O Mercado Pago aceitou, mas a order ainda aparece paga.
    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: true, situacao: "aguardando" });
    const pedido = (await buscarPedido(id))?.pedido;
    expect(pedido?.status).toBe("pago");
    expect(pedido?.reembolsoSolicitadoEm).not.toBeNull();
    expect(await autorizarDownload(itens[0].id, { token }, null)).toBeNull();
    expect(soma(await lancamentosDoPedido(id))).toBe(2000);
  });

  it("falha do Mercado Pago não estorna e o gestor pode tentar de novo com a mesma chave", async () => {
    ligarMercadoPago();
    const { id, orderId } = await pedidoPagoNoMercadoPago();
    respostaDoReembolso = () => new Response("{}", { status: 500 });
    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: false, motivo: "falhou" });
    expect(await statusDo(id)).toBe("pago");

    respostaDoReembolso = () =>
      new Response(JSON.stringify({ errors: [{ code: "order_already_refunded" }] }), {
        status: 409,
      });
    orders.set(orderId, { pedidoId: id, status: "refunded", status_detail: "refunded" });
    expect(await reembolsarPedido(GESTOR, id)).toEqual({ ok: true, situacao: "estornado" });
    const chaves = chamadas.filter((c) => c.url.endsWith("/refund")).map((c) => c.idempotencia);
    expect(new Set(chaves)).toEqual(new Set([`reembolso-${id}`]));
  });
});

describe("webhook: reembolso e chargeback lidos na order", () => {
  it("order reembolsada no Mercado Pago estorna uma vez, mesmo com avisos repetidos", async () => {
    ligarMercadoPago();
    const { id, orderId } = await pedidoPagoNoMercadoPago();
    orders.set(orderId, { pedidoId: id, status: "refunded", status_detail: "refunded" });

    await processarNotificacaoDeOrder(orderId);
    await processarNotificacaoDeOrder(orderId);
    await Promise.all([processarNotificacaoDeOrder(orderId), processarNotificacaoDeOrder(orderId)]);

    expect(await statusDo(id)).toBe("estornado");
    const lancamentos = await lancamentosDoPedido(id);
    expect(lancamentos).toHaveLength(4);
    expect(soma(lancamentos)).toBe(0);
  });

  it("chargeback: em disputa bloqueia e estorna; perdido encerra sem lançar de novo", async () => {
    ligarMercadoPago();
    const { id, orderId, token, itens } = await pedidoPagoNoMercadoPago();

    orders.set(orderId, { pedidoId: id, status: "charged_back", status_detail: "in_process" });
    await processarNotificacaoDeOrder(orderId);
    await processarNotificacaoDeOrder(orderId);
    expect(await statusDo(id)).toBe("contestado");
    expect(await autorizarDownload(itens[0].id, { token }, null)).toBeNull();
    expect(soma(await lancamentosDoPedido(id))).toBe(0);

    // Aviso antigo "paga" chegando depois do chargeback: não restaura sozinho.
    orders.set(orderId, { pedidoId: id, status: "processed", status_detail: "accredited" });
    await processarNotificacaoDeOrder(orderId);
    expect(await statusDo(id)).toBe("contestado");

    orders.set(orderId, { pedidoId: id, status: "charged_back", status_detail: "settled" });
    await processarNotificacaoDeOrder(orderId);
    const pedido = (await buscarPedido(id))?.pedido;
    expect(pedido?.status).toBe("estornado");
    expect(pedido?.motivoEstorno).toBe("chargeback");
    expect(await lancamentosDoPedido(id)).toHaveLength(4);
  });

  it("contestação ganha: o gestor restaura só com a order paga na API", async () => {
    ligarMercadoPago();
    const { id, orderId, token, itens } = await pedidoPagoNoMercadoPago();
    orders.set(orderId, { pedidoId: id, status: "charged_back", status_detail: "in_process" });
    await processarNotificacaoDeOrder(orderId);

    expect(await restaurarContestacao(id)).toEqual({ ok: false, motivo: "order_nao_paga" });
    expect(await statusDo(id)).toBe("contestado");

    orders.set(orderId, { pedidoId: id, status: "processed", status_detail: "accredited" });
    expect(await restaurarContestacao(id)).toEqual({ ok: true });
    expect(await restaurarContestacao(id)).toEqual({ ok: false, motivo: "nao_contestado" });
    expect(await statusDo(id)).toBe("pago");
    expect(await autorizarDownload(itens[0].id, { token }, null)).not.toBeNull();
    const lancamentos = await lancamentosDoPedido(id);
    expect(lancamentos).toHaveLength(6);
    expect(soma(lancamentos)).toBe(2000);

    // Nova contestação depois da restauração: estorna de novo os lançamentos vivos.
    orders.set(orderId, { pedidoId: id, status: "charged_back", status_detail: "in_process" });
    await processarNotificacaoDeOrder(orderId);
    expect(soma(await lancamentosDoPedido(id))).toBe(0);
  });

  it("ignora order de outro pedido", async () => {
    ligarMercadoPago();
    const { id, orderId } = await pedidoPagoNoMercadoPago();
    orders.set(orderId, {
      pedidoId: randomUUID(),
      status: "refunded",
      status_detail: "refunded",
    });
    await processarNotificacaoDeOrder(orderId);
    expect(await statusDo(id)).toBe("pago");
  });
});
