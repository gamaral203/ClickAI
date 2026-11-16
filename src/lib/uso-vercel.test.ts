import { afterEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ cacheLife: vi.fn() }));
vi.mock("next/cache", () => cache);

import {
  BYTES_MAXIMOS,
  cicloAtualVercel,
  consultarUsoVercel,
  CREDITO_INCLUSO_PRO_CENTAVOS,
  interpretarCobrancasVercel,
  lerCobrancasEmStreaming,
  lerUsoVercel,
  RespostaGrandeDemais,
  resumirUsoVercel,
} from "@/lib/uso-vercel";

// Uso da Vercel no Painel de uso: leitura do JSONL FOCUS de /v1/billing/charges (fetch falso),
// contas em centavos de dólar e falhas que nunca derrubam a página nem vazam o token.

const TOKEN = "vcp_token_de_teste_que_nao_pode_vazar";

function linha(campos: Record<string, unknown>) {
  return JSON.stringify({
    BillingCurrency: "USD",
    ChargeCategory: "Usage",
    ChargePeriodStart: "2026-11-01T00:00:00.000Z",
    ChargePeriodEnd: "2026-11-02T00:00:00.000Z",
    ...campos,
  });
}

const JSONL = [
  linha({
    ServiceName: "Fluid Active CPU",
    BilledCost: 7.1234,
    ConsumedQuantity: 10,
    ConsumedUnit: "Hours",
  }),
  linha({
    ServiceName: "Fluid Active CPU",
    BilledCost: "8.5",
    ConsumedQuantity: "5.5",
    ConsumedUnit: "Hours",
  }),
  linha({
    ServiceName: "Fast Origin Transfer",
    BilledCost: 3.3,
    ConsumedQuantity: 12,
    ConsumedUnit: "GB",
  }),
  linha({ ServiceName: "Function Storage", BilledCost: 0.004 }),
  linha({
    ServiceName: "Build CPU Minutes",
    BilledCost: 6.2,
    ConsumedQuantity: 300,
    ConsumedUnit: "Minutes",
  }),
  linha({ ChargeCategory: "Purchase", ServiceName: "Pro", BilledCost: 20 }),
  linha({ ChargeCategory: "Credit", ServiceName: "Pro credit", BilledCost: -20 }),
  linha({ ChargeCategory: "Tax", ServiceName: "Tax", BilledCost: 1.5 }),
  "",
  "isto não é json",
  linha({ ServiceName: "Sem valor", BilledCost: "abc" }),
  linha({ ServiceName: "Em euro", BilledCost: 3, BillingCurrency: "EUR" }),
].join("\n");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cache.cacheLife.mockClear();
});

describe("interpretarCobrancasVercel", () => {
  it("agrupa o uso por item, separa fixo, créditos e impostos, e conta as linhas ruins", () => {
    const c = interpretarCobrancasVercel(JSONL);
    expect(c.itens).toEqual([
      { nome: "Fluid Active CPU", custoCentavos: 1562, quantidade: 15.5, unidade: "Hours" },
      { nome: "Build CPU Minutes", custoCentavos: 620, quantidade: 300, unidade: "Minutes" },
      { nome: "Fast Origin Transfer", custoCentavos: 330, quantidade: 12, unidade: "GB" },
      { nome: "Function Storage", custoCentavos: 0, quantidade: null, unidade: null },
    ]);
    // 7,1234 + 8,5 + 3,3 + 0,004 + 6,2 = 25,1274 → US$ 25,13 (soma antes de arredondar).
    expect(c.usoCentavos).toBe(2513);
    expect(c.fixoCentavos).toBe(2000);
    expect(c.creditosEAjustesCentavos).toBe(-2000);
    expect(c.impostosCentavos).toBe(150);
    expect(c.ignoradas).toBe(3);
  });

  it("resposta vazia não quebra", () => {
    expect(interpretarCobrancasVercel("")).toMatchObject({
      itens: [],
      usoCentavos: 0,
      ignoradas: 0,
    });
  });

  it("crédito incluso de US$ 20 e o que passou dele", () => {
    const abaixo = resumirUsoVercel({ ...interpretarCobrancasVercel(""), usoCentavos: 1250 });
    expect(abaixo).toMatchObject({
      creditoInclusoCentavos: CREDITO_INCLUSO_PRO_CENTAVOS,
      creditoUsadoCentavos: 1250,
      excedenteCentavos: 0,
    });
    const acima = resumirUsoVercel(interpretarCobrancasVercel(JSONL));
    expect(acima).toMatchObject({ creditoUsadoCentavos: 2000, excedenteCentavos: 513 });
  });
});

describe("cicloAtualVercel", () => {
  it("do dia 1 do mês (UTC) até o começo de amanhã", () => {
    expect(cicloAtualVercel(Date.parse("2026-11-09T15:00:00Z"), 1)).toEqual({
      de: "2026-11-01T00:00:00.000Z",
      ate: "2026-11-10T00:00:00.000Z",
    });
  });
  it("com o ciclo no dia 15, antes dele volta ao mês passado (inclusive na virada do ano)", () => {
    expect(cicloAtualVercel(Date.parse("2027-01-09T15:00:00Z"), 15).de).toBe(
      "2026-12-15T00:00:00.000Z",
    );
    expect(cicloAtualVercel(Date.parse("2027-01-20T15:00:00Z"), 15).de).toBe(
      "2027-01-15T00:00:00.000Z",
    );
  });
});

describe("consultarUsoVercel", () => {
  it("sem VERCEL_API_TOKEN, não chama a Vercel", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await consultarUsoVercel()).toEqual({ estado: "nao-configurado" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("chama o endpoint com o token no cabeçalho, o ciclo e o time", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.stubEnv("VERCEL_TEAM_ID", "team_abc123");
    vi.stubEnv("VERCEL_DIA_DO_CICLO", "");
    const fetch = vi.fn(async () => new Response(JSONL, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const r = await consultarUsoVercel(Date.parse("2026-11-09T15:00:00Z"));
    expect(r).toMatchObject({ estado: "ok", usoCentavos: 2513, excedenteCentavos: 513 });

    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe("https://api.vercel.com/v1/billing/charges");
    expect(url.searchParams.get("from")).toBe("2026-11-01T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-11-10T00:00:00.000Z");
    expect(url.searchParams.get("teamId")).toBe("team_abc123");
    expect(url.toString()).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("time com caracteres estranhos não vai para a URL", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.stubEnv("VERCEL_TEAM_ID", "team&x=1");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await consultarUsoVercel()).toMatchObject({ estado: "falha" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])("HTTP %i vira falha, sem o token no log", async (status) => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.stubEnv("VERCEL_TEAM_ID", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{}}', { status })),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await consultarUsoVercel()).toMatchObject({ estado: "falha", erro: `HTTP ${status}` });
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });

  it("tempo esgotado e erro de rede viram falha", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tempo = new Error(`aborted ${TOKEN}`);
    tempo.name = "TimeoutError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(tempo)),
    );
    const r = await consultarUsoVercel();
    expect(r).toMatchObject({ estado: "falha", erro: "Tempo esgotado" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    expect(await consultarUsoVercel()).toMatchObject({ estado: "falha", erro: "TypeError" });
  });

  it("lerUsoVercel guarda por 5 minutos quando dá certo e 1 minuto quando falha", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSONL)),
    );
    await lerUsoVercel();
    expect(cache.cacheLife).toHaveBeenLastCalledWith({ stale: 300, revalidate: 300, expire: 3600 });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    await lerUsoVercel();
    expect(cache.cacheLife).toHaveBeenLastCalledWith("minutes");
  });
});

/** Corpo em stream a partir de pedaços (bytes), puxados sob demanda; `cancelado` diz se o leitor desistiu. */
function corpoEmPedacos(pedacos: Iterable<Uint8Array>) {
  const it = pedacos[Symbol.iterator]();
  const estado = { cancelado: false, lidos: 0 };
  const corpo = new ReadableStream<Uint8Array>({
    pull(c) {
      const p = it.next();
      if (p.done) c.close();
      else {
        estado.lidos++;
        c.enqueue(p.value);
      }
    },
    cancel() {
      estado.cancelado = true;
    },
  });
  return { corpo, estado };
}

describe("leitura em streaming", () => {
  it("soma um corpo de mais de 8 MB em vários pedaços, com linha partida e a última sem \n", async () => {
    const um = linha({
      ServiceName: "Fluid Active CPU",
      BilledCost: 0.01,
      ConsumedQuantity: 1,
      ConsumedUnit: "Hours",
      Tags: { ProjectName: "x".repeat(200) },
    });
    const outro = linha({ ServiceName: "Fast Origin Transfer", BilledCost: "0.02" });
    const N = 20_000;
    const partes: string[] = [];
    for (let i = 0; i < N; i++) partes.push(um, outro);
    const texto = partes.join("\n"); // sem \n no fim
    const bytes = new TextEncoder().encode(texto);
    expect(bytes.byteLength).toBeGreaterThan(8 * 1024 * 1024);
    // Pedaços de tamanho primo: linhas (e até caracteres) partidas entre pedaços.
    const TAM = 65_521;
    function* pedacos() {
      for (let i = 0; i < bytes.byteLength; i += TAM) yield bytes.subarray(i, i + TAM);
    }
    const { corpo, estado } = corpoEmPedacos(pedacos());
    expect(texto.endsWith("}")).toBe(true);

    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpo, { status: 200 })),
    );
    const r = await consultarUsoVercel();
    expect(estado.lidos).toBeGreaterThan(100);
    expect(r).toMatchObject({
      estado: "ok",
      itens: [
        { nome: "Fast Origin Transfer", custoCentavos: N * 2, quantidade: null, unidade: null },
        { nome: "Fluid Active CPU", custoCentavos: N, quantidade: N, unidade: "Hours" },
      ],
      usoCentavos: N * 3,
      ignoradas: 0,
    });
  });

  it("caractere de vários bytes partido entre pedaços não estraga a linha", async () => {
    const bytes = new TextEncoder().encode(
      `${linha({ ServiceName: "Função ç", BilledCost: 1 })}\n`,
    );
    const meio = bytes.indexOf(0xc3) + 1; // no meio do "ç"
    const { corpo } = corpoEmPedacos([bytes.subarray(0, meio), bytes.subarray(meio)]);
    const c = await lerCobrancasEmStreaming(corpo);
    expect(c.itens).toEqual([
      { nome: "Função ç", custoCentavos: 100, quantidade: null, unidade: null },
    ]);
  });

  it("passou do limite de bytes: cancela a leitura e mostra 'Resposta grande demais'", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const MB = new TextEncoder().encode(
      `${linha({ ServiceName: "X", BilledCost: 1 })}\n`.repeat(4_000),
    );
    const total = Math.ceil(BYTES_MAXIMOS / MB.byteLength) + 10;
    function* pedacos() {
      for (let i = 0; i < total; i++) yield MB;
    }
    const { corpo, estado } = corpoEmPedacos(pedacos());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpo, { status: 200 })),
    );
    expect(await consultarUsoVercel()).toMatchObject({
      estado: "falha",
      erro: "Resposta grande demais",
    });
    expect(estado.cancelado).toBe(true);
    expect(estado.lidos).toBeLessThan(total);
  });

  it("passou do limite de linhas ou linha sem fim: recusa e cancela", async () => {
    const enc = new TextEncoder();
    const linhas = corpoEmPedacos([enc.encode(`${linha({ BilledCost: 1 })}\n`.repeat(11))]);
    await expect(
      lerCobrancasEmStreaming(linhas.corpo, { bytes: BYTES_MAXIMOS, linhas: 10 }),
    ).rejects.toBeInstanceOf(RespostaGrandeDemais);

    const semFim = corpoEmPedacos(
      (function* () {
        for (let i = 0; i < 10; i++) yield enc.encode("x".repeat(64 * 1024));
      })(),
    );
    await expect(lerCobrancasEmStreaming(semFim.corpo)).rejects.toBeInstanceOf(
      RespostaGrandeDemais,
    );
    expect(semFim.estado.cancelado).toBe(true);
  });

  it("tempo esgotado no meio da leitura vira falha", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", TOKEN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tempo = new Error("aborted");
    tempo.name = "TimeoutError";
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(`${linha({ BilledCost: 1 })}\n`));
      },
      pull(c) {
        c.error(tempo);
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpo)),
    );
    expect(await consultarUsoVercel()).toMatchObject({ estado: "falha", erro: "Tempo esgotado" });
  });
});
