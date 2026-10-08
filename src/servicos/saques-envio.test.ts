import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FotografoConta, Lancamento, Saque, StatusSaque, Usuario } from "@/dados/tipos";

// Banco em memória só com o que o saque usa; o Mercado Pago é o `fetch` simulado.
const banco = vi.hoisted(() => ({
  saques: new Map<string, Saque>(),
  lancamentos: [] as Lancamento[],
}));

vi.mock("@/dados", () => ({
  listarLancamentosDoFotografo: async () => banco.lancamentos.map((l) => ({ ...l })),
  listarSaquesDoFotografo: async () => [...banco.saques.values()],
  listarSaquesProcessando: async () =>
    [...banco.saques.values()].filter((s) => s.status === "processando"),
  reservarLancamentosParaSaque: async (saque: Saque, ids: string[]) => {
    banco.saques.set(saque.id, { ...saque });
    for (const l of banco.lancamentos) if (ids.includes(l.id)) l.saqueId = saque.id;
    return true;
  },
  mudarStatusSaque: async (
    id: string,
    de: StatusSaque,
    para: StatusSaque,
    extra: Partial<Pick<Saque, "gatewayId" | "pagoEm">> = {},
  ) => {
    const s = banco.saques.get(id);
    if (!s || s.status !== de) return false;
    banco.saques.set(id, { ...s, ...extra, status: para });
    return true;
  },
  soltarLancamentosDoSaque: async (id: string) => {
    for (const l of banco.lancamentos) if (l.saqueId === id) l.saqueId = null;
  },
}));

const { conferirSaques, solicitarSaque } = await import("./saques");

const conta = {
  id: "f1",
  usuarioId: "u1",
  cpfCnpj: "123.456.789-09",
  chavePix: "12345678909",
  comissaoPct: 10,
} as FotografoConta;
const usuario = { id: "u1", email: "f@exemplo.com", papel: "fotografo" } as Usuario;

function mockFetch(resposta: () => Response) {
  const fn = vi.fn(async () => resposta());
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

function unicoSaque() {
  return [...banco.saques.values()][0];
}

function saldoLivre() {
  return banco.lancamentos.filter((l) => l.saqueId === null).length;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
  vi.stubEnv("MP_AMBIENTE", "teste");
  vi.stubEnv("SAQUE_SEM_PRAZO_EMAILS", "");
  banco.saques.clear();
  banco.lancamentos = [
    {
      id: "l1",
      fotografoId: "f1",
      itemPedidoId: "i1",
      valorCentavos: 1_000,
      disponivelEm: "2020-01-01T00:00:00.000Z",
      antecipavelEm: "2020-01-01T00:00:00.000Z",
      saqueId: null,
    },
  ];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("primeiro envio", () => {
  it("pago: guarda o payout e não devolve saldo", async () => {
    mockFetch(() =>
      json({ id: "po-1", transactions: [{ status: "success", status_detail: "accredited" }] }),
    );
    expect((await solicitarSaque(conta, usuario, false)).ok).toBe(true);
    expect(unicoSaque()).toMatchObject({ status: "pago", gatewayId: "po-1", liquidoCentavos: 900 });
    expect(saldoLivre()).toBe(0);
  });

  it("4xx claro (assinatura inválida): falhou e o saldo volta", async () => {
    mockFetch(() => json({ code: "invalid_signature" }, 400));
    await solicitarSaque(conta, usuario, false);
    expect(unicoSaque().status).toBe("falhou");
    expect(saldoLivre()).toBe(1);
  });

  it("4xx ambíguo (referência repetida): fica em processamento, sem devolver saldo", async () => {
    mockFetch(() => json({ code: "duplicated_external_reference" }, 400));
    await solicitarSaque(conta, usuario, false);
    expect(unicoSaque().status).toBe("processando");
    expect(saldoLivre()).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("revisão manual"),
      expect.anything(),
    );
  });

  it("timeout ou 5xx: fica em processamento", async () => {
    mockFetch(() => json({ message: "erro" }, 502));
    await solicitarSaque(conta, usuario, false);
    expect(unicoSaque().status).toBe("processando");
    expect(saldoLivre()).toBe(0);
  });

  it("produção sem MP_PAYOUTS_HABILITADO: não chama a API e devolve o saldo", async () => {
    vi.stubEnv("MP_AMBIENTE", "producao");
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", "qualquer");
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "");
    const fetch = mockFetch(() => json({}));
    await solicitarSaque(conta, usuario, false);
    expect(fetch).not.toHaveBeenCalled();
    expect(unicoSaque().status).toBe("falhou");
    expect(saldoLivre()).toBe(1);
  });

  it("produção sem a chave privada: não chama a API", async () => {
    vi.stubEnv("MP_AMBIENTE", "producao");
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", "");
    vi.stubEnv("MP_PAYOUTS_HABILITADO", "1");
    const fetch = mockFetch(() => json({}));
    await solicitarSaque(conta, usuario, false);
    expect(fetch).not.toHaveBeenCalled();
    expect(unicoSaque().status).toBe("falhou");
  });
});

describe("reenvio na conferência (primeiro envio ficou sem resposta)", () => {
  async function saqueSemResposta() {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    await solicitarSaque(conta, usuario, false);
    expect(unicoSaque()).toMatchObject({ status: "processando", gatewayId: null });
  }

  it("4xx, mesmo claro, não devolve saldo: fica em processamento com alerta", async () => {
    await saqueSemResposta();
    mockFetch(() => json({ code: "invalid_signature" }, 400));
    await conferirSaques("f1");
    expect(unicoSaque().status).toBe("processando");
    expect(saldoLivre()).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("revisão manual"),
      expect.anything(),
    );
  });

  it("saque não habilitado no reenvio: não devolve saldo", async () => {
    await saqueSemResposta();
    vi.stubEnv("MP_AMBIENTE", "producao");
    vi.stubEnv("MP_PAYOUTS_PRIVATE_KEY", "");
    await conferirSaques("f1");
    expect(unicoSaque().status).toBe("processando");
    expect(saldoLivre()).toBe(0);
  });

  it("reenvio que devolve o payout já pago (mesma idempotência): marca pago", async () => {
    await saqueSemResposta();
    const fetch = mockFetch(() =>
      json({ id: "po-2", transactions: [{ status: "success", status_detail: "accredited" }] }),
    );
    await conferirSaques("f1");
    expect(unicoSaque()).toMatchObject({ status: "pago", gatewayId: "po-2" });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Idempotency-Key"]).toBe(unicoSaque().id);
  });
});

describe("conferência pelo status das transações", () => {
  async function saqueEnviado() {
    mockFetch(() => json({ id: "po-1", status: "created" }));
    await solicitarSaque(conta, usuario, false);
    expect(unicoSaque()).toMatchObject({ status: "processando", gatewayId: "po-1" });
  }

  it.each([
    ["success", "accredited", "pago", 0],
    ["success", "in_progress", "processando", 0],
    ["transaction_in_process", undefined, "processando", 0],
    ["rejected", undefined, "falhou", 1],
    ["error", undefined, "falhou", 1],
    ["canceled", undefined, "falhou", 1],
    ["refunded", undefined, "processando", 0],
    ["partially_refunded", undefined, "processando", 0],
  ])("%s/%s → %s", async (status, detalhe, esperado, livres) => {
    await saqueEnviado();
    const fetch = mockFetch(() => json({ results: [{ status, status_detail: detalhe }] }));
    await conferirSaques("f1");
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(
      /\/v1\/payouts\/po-1\/transactions$/,
    );
    expect(unicoSaque().status).toBe(esperado);
    expect(saldoLivre()).toBe(livres);
  });
});
