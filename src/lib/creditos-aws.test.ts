import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cliente da AWS falso: guarda a configuração recebida e responde o que cada teste mandar.
const aws = vi.hoisted(() => ({
  configs: [] as Record<string, unknown>[],
  send: vi.fn(),
}));
vi.mock("@aws-sdk/client-freetier", () => ({
  FreeTierClient: class {
    constructor(config: Record<string, unknown>) {
      aws.configs.push(config);
    }
    send(comando: unknown) {
      return aws.send(comando);
    }
  },
  GetAccountPlanStateCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
const cache = vi.hoisted(() => ({ cacheLife: vi.fn() }));
vi.mock("next/cache", () => cache);

import { consultarCreditosAws, lerCreditosAws, REGIAO_FREE_TIER } from "@/lib/creditos-aws";
import {
  diasParaExpirar,
  dolaresParaCentavos,
  resumirCreditosAws,
  textoAtualizadoHa,
  textoDaExpiracao,
} from "@/lib/painel-de-uso";

// Créditos da AWS no Painel de uso: contas em centavos de dólar e a leitura da API Free Tier
// (GetAccountPlanState), que nunca derruba a página.

function erroDaAws(nome: string) {
  const e = new Error("mensagem da AWS");
  e.name = nome;
  return e;
}

/** Chaves com um id diferente a cada teste: o cliente da AWS é recriado. */
let chave = 0;
function comCredenciais() {
  chave += 1;
  vi.stubEnv("REKOGNITION_REGIAO", "sa-east-1");
  vi.stubEnv("REKOGNITION_ACCESS_KEY_ID", `AKIATESTE${chave}`);
  vi.stubEnv("REKOGNITION_SECRET_ACCESS_KEY", "segredo-de-teste");
}

beforeEach(() => {
  aws.configs.length = 0;
  aws.send.mockReset();
  cache.cacheLife.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("contas dos créditos", () => {
  it("dólares da AWS viram centavos inteiros; valor inválido vira null", () => {
    expect(dolaresParaCentavos(43.76)).toBe(4376);
    expect(dolaresParaCentavos(0.1 + 0.2)).toBe(30);
    expect(dolaresParaCentavos(100)).toBe(10000);
    expect(dolaresParaCentavos(0)).toBe(0);
    expect(dolaresParaCentavos(-1)).toBeNull();
    expect(dolaresParaCentavos(Number.NaN)).toBeNull();
    expect(dolaresParaCentavos(undefined)).toBeNull();
    expect(dolaresParaCentavos("43.76")).toBeNull();
  });

  it("usado = total − restante, com a fração usada", () => {
    expect(resumirCreditosAws(4376, 10000)).toEqual({
      totalCentavos: 10000,
      usadoCentavos: 5624,
      restanteCentavos: 4376,
      fracaoUsada: 0.5624,
      totalAjustado: false,
    });
    expect(resumirCreditosAws(0, 10000)).toMatchObject({ usadoCentavos: 10000, fracaoUsada: 1 });
    expect(resumirCreditosAws(10000, 10000)).toMatchObject({ usadoCentavos: 0, fracaoUsada: 0 });
  });

  it("restante acima do total configurado (créditos extras): o total vira o restante", () => {
    expect(resumirCreditosAws(15000, 10000)).toEqual({
      totalCentavos: 15000,
      usadoCentavos: 0,
      restanteCentavos: 15000,
      fracaoUsada: 0,
      totalAjustado: true,
    });
  });

  it("expiração contada no calendário de Brasília", () => {
    const agora = Date.parse("2026-11-01T12:00:00-03:00");
    expect(diasParaExpirar("2027-01-13T12:00:00.000Z", agora)).toBe(73);
    // 01h de 02/11 em UTC ainda é 01/11 em Brasília: expira hoje.
    expect(diasParaExpirar("2026-11-02T01:00:00.000Z", agora)).toBe(0);
    expect(textoDaExpiracao(73)).toBe("expira em 73 dias");
    expect(textoDaExpiracao(1)).toBe("expira amanhã");
    expect(textoDaExpiracao(0)).toBe("expira hoje");
    expect(textoDaExpiracao(-1)).toBe("expirou ontem");
    expect(textoDaExpiracao(-4)).toBe("expirou há 4 dias");
  });

  it("há quanto tempo foi a leitura", () => {
    const lido = "2026-11-01T12:00:00.000Z";
    const em = (min: number) => Date.parse(lido) + min * 60_000;
    expect(textoAtualizadoHa(lido, em(0))).toBe("agora há pouco");
    expect(textoAtualizadoHa(lido, em(5))).toBe("há 5 min");
    expect(textoAtualizadoHa(lido, em(59))).toBe("há 59 min");
    expect(textoAtualizadoHa(lido, em(125))).toBe("há 2 h");
    expect(textoAtualizadoHa(lido, em(60 * 24))).toBe("há 1 dia");
    expect(textoAtualizadoHa(lido, em(60 * 50))).toBe("há 2 dias");
  });
});

describe("leitura na API Free Tier", () => {
  it("sem as chaves REKOGNITION_* (provedor de exemplo), não chama a AWS", async () => {
    vi.stubEnv("REKOGNITION_REGIAO", "");
    vi.stubEnv("REKOGNITION_ACCESS_KEY_ID", "");
    vi.stubEnv("REKOGNITION_SECRET_ACCESS_KEY", "");
    // As AWS_* da Vercel nunca contam.
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAVERCEL");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "da-plataforma");
    expect(await consultarCreditosAws()).toEqual({ estado: "nao-configurado" });
    expect(aws.send).not.toHaveBeenCalled();
    expect(aws.configs).toHaveLength(0);
  });

  it("lê o restante e a validade, em us-east-1, com as chaves do Rekognition", async () => {
    comCredenciais();
    aws.send.mockResolvedValue({
      accountId: "123456789012",
      accountPlanType: "FREE",
      accountPlanStatus: "ACTIVE",
      accountPlanRemainingCredits: { amount: 43.76, unit: "USD" },
      accountPlanExpirationDate: new Date("2027-01-13T12:00:00.000Z"),
    });
    const leitura = await consultarCreditosAws();
    expect(leitura).toMatchObject({
      estado: "ok",
      plano: "FREE",
      situacao: "ACTIVE",
      restanteCentavos: 4376,
      expiraEm: "2027-01-13T12:00:00.000Z",
    });
    // O id da conta não sai daqui.
    expect(JSON.stringify(leitura)).not.toContain("123456789012");
    expect(aws.configs[0]).toMatchObject({
      region: REGIAO_FREE_TIER,
      credentials: { accessKeyId: `AKIATESTE${chave}`, secretAccessKey: "segredo-de-teste" },
    });
    expect(REGIAO_FREE_TIER).toBe("us-east-1");
  });

  it("sem créditos ou sem validade na resposta: devolve null nesses campos", async () => {
    comCredenciais();
    aws.send.mockResolvedValue({
      accountId: "123456789012",
      accountPlanType: "PAID",
      accountPlanStatus: "ACTIVE",
    });
    expect(await consultarCreditosAws()).toMatchObject({
      estado: "ok",
      plano: "PAID",
      restanteCentavos: null,
      expiraEm: null,
    });
  });

  it("AccessDenied vira 'sem permissão', sem lançar e sem pôr a mensagem da AWS no log", async () => {
    comCredenciais();
    aws.send.mockRejectedValue(erroDaAws("AccessDeniedException"));
    expect(await consultarCreditosAws()).toMatchObject({ estado: "sem-permissao" });
    const logado = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logado).not.toContain("mensagem da AWS");
    expect(logado).not.toContain("segredo-de-teste");
  });

  it("outra falha da AWS vira 'falha' com só o nome do erro", async () => {
    comCredenciais();
    aws.send.mockRejectedValue(erroDaAws("ThrottlingException"));
    expect(await consultarCreditosAws()).toMatchObject({
      estado: "falha",
      erro: "ThrottlingException",
    });
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ["[creditos-aws] falha ao ler os créditos", "ThrottlingException"],
    ]);
  });

  it("cache: 1 hora quando lê; poucos minutos quando falha", async () => {
    comCredenciais();
    aws.send.mockResolvedValue({
      accountId: "123456789012",
      accountPlanType: "FREE",
      accountPlanStatus: "ACTIVE",
      accountPlanRemainingCredits: { amount: 43.76, unit: "USD" },
    });
    expect(await lerCreditosAws()).toMatchObject({ estado: "ok" });
    expect(cache.cacheLife).toHaveBeenLastCalledWith("hours");

    aws.send.mockRejectedValue(erroDaAws("AccessDeniedException"));
    expect(await lerCreditosAws()).toMatchObject({ estado: "sem-permissao" });
    expect(cache.cacheLife).toHaveBeenLastCalledWith("minutes");
    expect(cache.cacheLife).toHaveBeenCalledTimes(2);
  });
});
