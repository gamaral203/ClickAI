import { generateKeyPairSync, verify } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buscarPayout,
  enviarPayoutPix,
  ErroMercadoPago,
  recusaDoPayout,
  SaqueNaoHabilitado,
  situacaoDaTransacao,
} from "./mercadopago";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const chaveBase64 = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString(
  "base64",
);

const SAQUE = "3f1c2a9e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const dados = { saqueId: SAQUE, liquidoCentavos: 100, chavePix: "12345678909" };

type Chamada = { url: string; init: RequestInit };

function mockFetch(corpo: unknown, status = 200) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify(corpo), { status });
    }),
  );
  return chamadas;
}

function headers(chamada: Chamada) {
  return chamada.init.headers as Record<string, string>;
}

const respostaOk = {
  id: "po-1",
  status: "created",
  transactions: [
    {
      id: "tx-1",
      status: "success",
      status_detail: "accredited",
      external_reference: `${SAQUE}-pix`,
    },
  ],
};

beforeEach(() => {
  vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
  vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", "");
  vi.stubEnv("MP_PAYOUTS_HABILITADO", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Payouts em teste", () => {
  beforeEach(() => vi.stubEnv("MP_AMBIENTE", "teste"));

  it("manda X-test-token, não exige assinatura e usa o id do saque como idempotência", async () => {
    const chamadas = mockFetch(respostaOk);
    const r = await enviarPayoutPix(dados);
    expect(r).toMatchObject({ id: "po-1", transacaoId: "tx-1", situacao: "pago" });
    const h = headers(chamadas[0]);
    expect(chamadas[0].url).toBe("https://api.mercadopago.com/v1/payouts");
    expect(h["X-test-token"]).toBe("true");
    expect(h["X-enforce-signature"]).toBe("false");
    expect(h["X-signature"]).toBeUndefined();
    expect(h["X-Idempotency-Key"]).toBe(SAQUE);
    expect(h.Authorization).toBe("Bearer TEST-token");
  });

  it("corpo com referências válidas, descrições sem acento e o valor em reais", async () => {
    const chamadas = mockFetch(respostaOk);
    await enviarPayoutPix(dados);
    const corpo = JSON.parse(chamadas[0].init.body as string);
    expect(corpo.external_reference).toBe(SAQUE);
    const textos = [corpo.description, corpo.transactions[0].description];
    for (const t of textos) expect(t).toMatch(/^[A-Za-z0-9 _-]+$/);
    for (const ref of [corpo.external_reference, corpo.transactions[0].external_reference]) {
      expect(ref).toMatch(/^[A-Za-z0-9_-]{1,50}$/);
    }
    expect(corpo.transactions[0].amount).toEqual({ currency: "BRL", value: 1 });
    expect(corpo.transactions[0].pix).toEqual({ type: "CPF", chave: "123.456.789-09" });
  });

  it("consulta o status pelas transações do payout", async () => {
    const chamadas = mockFetch({
      results: [
        {
          id: "tx-9",
          status: "success",
          status_detail: "in_progress",
          external_reference: `${SAQUE}-pix`,
        },
      ],
    });
    const r = await buscarPayout("po-1", SAQUE);
    expect(chamadas[0].url).toBe("https://api.mercadopago.com/v1/payouts/po-1/transactions");
    expect(chamadas[0].init.method).toBe("GET");
    expect(headers(chamadas[0])["X-test-token"]).toBe("true");
    expect(r).toMatchObject({ transacaoId: "tx-9", situacao: "processando" });
  });

  it("consulta aceita a lista direto e transação sem dados fica em processamento", async () => {
    mockFetch([{ id: 5, status: "rejected" }]);
    expect((await buscarPayout("po-1", SAQUE)).situacao).toBe("falhou");
    mockFetch({ results: [] });
    expect((await buscarPayout("po-1", SAQUE)).situacao).toBe("processando");
  });
});

describe("Payouts em produção", () => {
  beforeEach(() => vi.stubEnv("MP_AMBIENTE", "producao"));

  it("sem a chave privada: recusa sem chamar a API", async () => {
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "1");
    const chamadas = mockFetch(respostaOk);
    await expect(enviarPayoutPix(dados)).rejects.toBeInstanceOf(SaqueNaoHabilitado);
    await expect(enviarPayoutPix(dados)).rejects.toThrow(/MP_PAYOUTS_PRIVATE_KEY/);
    expect(chamadas).toHaveLength(0);
  });

  it("com a chave mas sem MP_PAYOUTS_HABILITADO=1: recusa sem chamar a API", async () => {
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", chaveBase64);
    const chamadas = mockFetch(respostaOk);
    await expect(enviarPayoutPix(dados)).rejects.toThrow(/MP_PAYOUTS_HABILITADO/);
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "true");
    await expect(enviarPayoutPix(dados)).rejects.toBeInstanceOf(SaqueNaoHabilitado);
    expect(chamadas).toHaveLength(0);
  });

  it("chave inválida: recusa sem chamar a API", async () => {
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", Buffer.from("lixo").toString("base64"));
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "1");
    const chamadas = mockFetch(respostaOk);
    await expect(enviarPayoutPix(dados)).rejects.toThrow(/inválida/);
    expect(chamadas).toHaveLength(0);
  });

  it("assina os bytes exatos do corpo enviado, verificável com a chave pública", async () => {
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", chaveBase64);
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "1");
    const chamadas = mockFetch(respostaOk);
    const r = await enviarPayoutPix(dados);
    expect(r.situacao).toBe("pago");

    const h = headers(chamadas[0]);
    expect(h["X-test-token"]).toBeUndefined();
    expect(h["X-enforce-signature"]).toBe("true");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-Idempotency-Key"]).toBe(SAQUE);
    expect(h["X-signature"]).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const corpoEnviado = chamadas[0].init.body as string;
    expect(typeof corpoEnviado).toBe("string");
    const assinatura = Buffer.from(h["X-signature"], "base64");
    expect(verify(null, Buffer.from(corpoEnviado, "utf8"), publicKey, assinatura)).toBe(true);
    // Qualquer byte a mais (outra serialização) invalida.
    const outro = JSON.stringify(JSON.parse(corpoEnviado), null, 1);
    expect(verify(null, Buffer.from(outro, "utf8"), publicKey, assinatura)).toBe(false);
  });

  it("aceita a chave como PEM direto, com \\n escritos", async () => {
    const pem = (privateKey.export({ type: "pkcs8", format: "pem" }) as string).replace(
      /\n/g,
      "\\n",
    );
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", pem);
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "1");
    const chamadas = mockFetch(respostaOk);
    await enviarPayoutPix(dados);
    const h = headers(chamadas[0]);
    const corpo = Buffer.from(chamadas[0].init.body as string, "utf8");
    expect(verify(null, corpo, publicKey, Buffer.from(h["X-signature"], "base64"))).toBe(true);
  });

  it("consulta em produção sem X-test-token", async () => {
    const chamadas = mockFetch({ results: [] });
    await buscarPayout("po-1", SAQUE);
    expect(headers(chamadas[0])["X-test-token"]).toBeUndefined();
  });
});

describe("situacaoDaTransacao", () => {
  const casos: [string, string | null, string][] = [
    ["success", "accredited", "pago"],
    ["success", "in_progress", "processando"],
    ["success", null, "processando"],
    ["created", null, "processando"],
    ["approved", null, "processando"],
    ["transaction_in_process", null, "processando"],
    ["error", null, "falhou"],
    ["rejected", "insufficient_funds", "falhou"],
    ["canceled", null, "falhou"],
    ["refunded", null, "revisao"],
    ["partially_refunded", null, "revisao"],
    ["success", "refunded", "revisao"],
    ["success", "partially_refunded", "revisao"],
    ["status_novo", null, "processando"],
  ];
  it.each(casos)("%s + %s → %s", (status, detalhe, esperado) => {
    expect(situacaoDaTransacao(status, detalhe)).toBe(esperado);
  });

  it("sem status: processando", () => {
    expect(situacaoDaTransacao(null, null)).toBe("processando");
  });
});

describe("recusaDoPayout", () => {
  const erro = (status: number, corpo: unknown) => new ErroMercadoPago(status, corpo);

  it("clara: assinatura, token, permissão, idempotência ausente, corpo inválido", () => {
    expect(recusaDoPayout(erro(400, { code: "invalid_signature" }))).toBe("clara");
    expect(recusaDoPayout(erro(400, { errors: [{ code: "idempotency_key_required" }] }))).toBe(
      "clara",
    );
    expect(recusaDoPayout(erro(401, { message: "unauthorized" }))).toBe("clara");
    expect(recusaDoPayout(erro(403, null))).toBe("clara");
    expect(recusaDoPayout(erro(400, { error: "invalid_token" }))).toBe("clara");
    expect(recusaDoPayout(erro(400, { cause: [{ code: "invalid_amount" }] }))).toBe("clara");
  });

  it("ambígua: referência repetida, conflito, sem código ou 5xx", () => {
    expect(
      recusaDoPayout(erro(400, { code: "invalid_external_reference", message: "already used" })),
    ).toBe("ambigua");
    expect(recusaDoPayout(erro(400, { code: "duplicated_external_reference" }))).toBe("ambigua");
    expect(recusaDoPayout(erro(409, { code: "invalid_signature" }))).toBe("ambigua");
    expect(recusaDoPayout(erro(400, null))).toBe("ambigua");
    expect(recusaDoPayout(erro(422, { code: "bad_request" }))).toBe("ambigua");
    expect(recusaDoPayout(erro(500, { code: "invalid_signature" }))).toBe("ambigua");
  });
});
