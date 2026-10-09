import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decidirValidacao } from "@/app/api/webhooks/asaas/saque/decisao";

import {
  buscarCobrancaAsaas,
  centavosParaReais,
  criarCobrancaPixAsaas,
  enviarTransferenciaPixAsaas,
  ErroAsaas,
  reaisParaCentavos,
  recusaDaTransferencia,
  reembolsoJaPedidoAsaas,
  situacaoDaCobrancaAsaas,
  situacaoDaTransferencia,
  tokenDoWebhookConfere,
} from "./asaas";
import { asaasFaltandoEmProducao, mercadoPagoFaltandoEmProducao } from "./ambiente-producao";
import { exigeCpfDoComprador, provedorDePagamento } from "./gateway";

type Chamada = { url: string; init: RequestInit };

/** Responde cada chamada pela primeira regra cujo trecho de URL (e método) bate. */
function mockFetch(regras: { trecho: string; metodo?: string; corpo: unknown; status?: number }[]) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      const regra = regras.find(
        (r) => url.includes(r.trecho) && (!r.metodo || r.metodo === (init.method ?? "GET")),
      );
      if (!regra) return new Response(JSON.stringify({ errors: [] }), { status: 404 });
      return new Response(JSON.stringify(regra.corpo), { status: regra.status ?? 200 });
    }),
  );
  return chamadas;
}

beforeEach(() => {
  vi.stubEnv("ASAAS_API_KEY", "$aact_teste");
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-do-webhook-123");
  vi.stubEnv("ASAAS_AMBIENTE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("escolha do gateway", () => {
  it("com ASAAS_API_KEY, o pagamento é pelo Asaas e o checkout pede o CPF", () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
    expect(provedorDePagamento()).toBe("asaas");
    expect(exigeCpfDoComprador()).toBe(true);
  });

  it("sem ela, volta ao Mercado Pago, que não pede CPF", () => {
    vi.stubEnv("ASAAS_API_KEY", "");
    vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
    expect(provedorDePagamento()).toBe("mercadopago");
    expect(exigeCpfDoComprador()).toBe(false);
  });

  it("na produção com Asaas, exige o token do webhook e dispensa o Mercado Pago", () => {
    const env = { VERCEL_ENV: "production", ASAAS_API_KEY: "x" };
    expect(asaasFaltandoEmProducao(env)).toEqual(["ASAAS_WEBHOOK_TOKEN"]);
    expect(mercadoPagoFaltandoEmProducao(env)).toEqual([]);
    expect(asaasFaltandoEmProducao({ ...env, ASAAS_WEBHOOK_TOKEN: "y" })).toEqual([]);
  });
});

describe("valores", () => {
  it("converte centavos e reais sem erro de arredondamento", () => {
    expect(centavosParaReais(1990)).toBe(19.9);
    expect(reaisParaCentavos(19.9)).toBe(1990);
    expect(reaisParaCentavos(0.29)).toBe(29);
    expect(reaisParaCentavos(1234.56)).toBe(123456);
  });
});

describe("situação da cobrança", () => {
  it("pago, reembolso e chargeback", () => {
    expect(situacaoDaCobrancaAsaas("RECEIVED")).toBe("paga");
    expect(situacaoDaCobrancaAsaas("CONFIRMED")).toBe("paga");
    expect(situacaoDaCobrancaAsaas("REFUNDED")).toBe("reembolsada");
    expect(situacaoDaCobrancaAsaas("REFUND_IN_PROGRESS")).toBe("reembolsada");
    expect(situacaoDaCobrancaAsaas("CHARGEBACK_REQUESTED")).toBe("contestada");
    expect(situacaoDaCobrancaAsaas("AWAITING_CHARGEBACK_REVERSAL")).toBe("contestada");
    expect(situacaoDaCobrancaAsaas("PENDING")).toBe("outra");
    expect(situacaoDaCobrancaAsaas("OVERDUE")).toBe("outra");
  });

  it("lê a cobrança na API com o valor em centavos e a referência do pedido", async () => {
    mockFetch([
      {
        trecho: "/payments/pay_1",
        corpo: { id: "pay_1", status: "RECEIVED", value: 19.9, externalReference: "pedido-1" },
      },
    ]);
    const cobranca = await buscarCobrancaAsaas("pay_1");
    expect(cobranca).toMatchObject({
      id: "pay_1",
      paga: true,
      totalCentavos: 1990,
      referencia: "pedido-1",
      encerrada: false,
    });
  });

  it("cobrança apagada conta como encerrada", async () => {
    mockFetch([
      {
        trecho: "/payments/pay_2",
        corpo: { id: "pay_2", status: "PENDING", value: 5, deleted: true },
      },
    ]);
    expect((await buscarCobrancaAsaas("pay_2")).encerrada).toBe(true);
  });
});

describe("cobrança Pix", () => {
  const dados = {
    pedidoId: "pedido-9",
    totalCentavos: 2990,
    nome: "Ana",
    email: "ana@exemplo.com",
    cpf: "12345678909",
  };

  it("cria o cliente, a cobrança com o pedido como referência e busca o QR Code", async () => {
    const chamadas = mockFetch([
      { trecho: "/customers?cpfCnpj=", corpo: { data: [] } },
      { trecho: "/customers", metodo: "POST", corpo: { id: "cus_1" } },
      { trecho: "/payments?externalReference=", corpo: { data: [] } },
      {
        trecho: "/payments/pay_9/pixQrCode",
        corpo: { encodedImage: "iVBOR", payload: "000201pix" },
      },
      {
        trecho: "/payments",
        metodo: "POST",
        corpo: { id: "pay_9", status: "PENDING", value: 29.9, externalReference: "pedido-9" },
      },
    ]);
    const cobranca = await criarCobrancaPixAsaas(dados);
    expect(cobranca.pix).toEqual({ copiaECola: "000201pix", qrCodeBase64: "iVBOR" });
    expect(cobranca.id).toBe("pay_9");

    const criar = chamadas.find((c) => c.url.endsWith("/payments") && c.init.method === "POST");
    expect(JSON.parse(String(criar?.init.body))).toMatchObject({
      customer: "cus_1",
      billingType: "PIX",
      value: 29.9,
      externalReference: "pedido-9",
    });
    const cliente = chamadas.find((c) => c.url.endsWith("/customers") && c.init.method === "POST");
    expect(JSON.parse(String(cliente?.init.body))).toMatchObject({ notificationDisabled: true });
    // Sandbox por padrão; a chave vai no header access_token.
    expect(chamadas[0].url).toMatch(/^https:\/\/api-sandbox\.asaas\.com\/v3\//);
    expect((chamadas[0].init.headers as Record<string, string>).access_token).toBe("$aact_teste");
  });

  it("não cria uma segunda cobrança para o mesmo pedido", async () => {
    const chamadas = mockFetch([
      { trecho: "/customers?cpfCnpj=", corpo: { data: [{ id: "cus_1" }] } },
      {
        trecho: "/payments?externalReference=",
        corpo: {
          data: [{ id: "pay_9", status: "PENDING", value: 29.9, billingType: "PIX" }],
        },
      },
      { trecho: "/payments/pay_9/pixQrCode", corpo: { encodedImage: "x", payload: "y" } },
    ]);
    await criarCobrancaPixAsaas(dados);
    expect(chamadas.some((c) => c.init.method === "POST")).toBe(false);
  });

  it("produção usa a API de produção", async () => {
    vi.stubEnv("ASAAS_AMBIENTE", "producao");
    const chamadas = mockFetch([
      { trecho: "/payments/pay_1", corpo: { id: "pay_1", status: "PENDING", value: 1 } },
    ]);
    await buscarCobrancaAsaas("pay_1");
    expect(chamadas[0].url).toMatch(/^https:\/\/api\.asaas\.com\/v3\//);
  });
});

describe("reembolso", () => {
  it("reconhece o reembolso já feito", () => {
    const erro = new ErroAsaas(400, {
      errors: [{ code: "invalid_action", description: "A cobrança já está estornada." }],
    });
    expect(reembolsoJaPedidoAsaas(erro)).toBe(true);
    expect(reembolsoJaPedidoAsaas(new ErroAsaas(400, { errors: [] }))).toBe(false);
    expect(reembolsoJaPedidoAsaas(new ErroAsaas(500, null))).toBe(false);
  });
});

describe("saque por transferência Pix", () => {
  it("envia o valor em reais para a chave CPF, com o saque como referência", async () => {
    const chamadas = mockFetch([
      { trecho: "/transfers", corpo: { id: "tr_1", status: "PENDING" } },
    ]);
    const r = await enviarTransferenciaPixAsaas({
      saqueId: "saque-1",
      liquidoCentavos: 12345,
      chavePix: "12345678909",
    });
    expect(r).toMatchObject({ id: "tr_1", situacao: "processando" });
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({
      value: 123.45,
      pixAddressKey: "12345678909",
      pixAddressKeyType: "CPF",
      description: "Saque ClicouAi",
      externalReference: "saque-1",
    });
  });

  it("status da transferência", () => {
    expect(situacaoDaTransferencia("DONE")).toBe("pago");
    expect(situacaoDaTransferencia("FAILED")).toBe("falhou");
    expect(situacaoDaTransferencia("CANCELLED")).toBe("falhou");
    expect(situacaoDaTransferencia("BANK_PROCESSING")).toBe("processando");
    expect(situacaoDaTransferencia("BLOCKED")).toBe("processando");
  });

  it("recusa clara só quando a transferência certamente não foi criada", () => {
    expect(
      recusaDaTransferencia(
        new ErroAsaas(400, { errors: [{ description: "Saldo insuficiente" }] }),
      ),
    ).toBe("clara");
    expect(recusaDaTransferencia(new ErroAsaas(401, null))).toBe("clara");
    expect(recusaDaTransferencia(new ErroAsaas(500, null))).toBe("ambigua");
    expect(recusaDaTransferencia(new ErroAsaas(409, null))).toBe("ambigua");
    expect(
      recusaDaTransferencia(
        new ErroAsaas(400, { errors: [{ description: "Transferência duplicada" }] }),
      ),
    ).toBe("ambigua");
  });
});

describe("webhooks", () => {
  it("confere o token em tempo constante", () => {
    expect(tokenDoWebhookConfere("token-do-webhook-123")).toBe(true);
    expect(tokenDoWebhookConfere("token-errado")).toBe(false);
    expect(tokenDoWebhookConfere(null)).toBe(false);
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
    expect(tokenDoWebhookConfere("")).toBe(false);
  });
});

describe("validação de saque", () => {
  const transferencia = {
    type: "TRANSFER",
    transfer: {
      id: "tr_1",
      value: 123.45,
      bankAccount: { cpfCnpj: "123.456.789-09", pixAddressKey: null },
    },
  };

  it("aprova a transferência que bate com um saque e passa valor e chave certos", async () => {
    const reivindicar = vi.fn(async () => true);
    expect(await decidirValidacao(transferencia, reivindicar, false)).toEqual({ aprovado: true });
    expect(reivindicar).toHaveBeenCalledWith({
      transferenciaId: "tr_1",
      liquidoCentavos: 12345,
      chavesPix: ["12345678909"],
    });
  });

  it("recusa a transferência sem saque (segunda transferência, chave roubada ou manual)", async () => {
    const decisao = await decidirValidacao(transferencia, async () => false, false);
    expect(decisao.aprovado).toBe(false);
  });

  it("aprova reembolso Pix; recusa outras saídas, a não ser que liberadas", async () => {
    const nunca = vi.fn(async () => true);
    expect(await decidirValidacao({ type: "PIX_REFUND" }, nunca, false)).toEqual({
      aprovado: true,
    });
    expect((await decidirValidacao({ type: "BILL" }, nunca, false)).aprovado).toBe(false);
    expect(await decidirValidacao({ type: "BILL" }, nunca, true)).toEqual({ aprovado: true });
    expect((await decidirValidacao(null, nunca, true)).aprovado).toBe(false);
    expect(nunca).not.toHaveBeenCalled();
  });
});
