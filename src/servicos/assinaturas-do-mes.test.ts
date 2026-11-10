import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const pote = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
    set: (nome: string, valor: string) => pote.set(nome, valor),
    delete: (nome: string) => pote.delete(nome),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.51" }),
}));

import {
  alternarAssinaturaAcao,
  marcarAssinaturaPagaAcao,
  renovarNoProximoMesAcao,
} from "@/app/(admin)/admin/uso/acoes";
import {
  criarAssinatura,
  criarUsuario,
  definirAssinaturaAtiva,
  definirRenovacaoDoMes,
  garantirAssinaturasDoMes,
  listarAssinaturasDoMes,
  marcarAssinaturaDoMesPaga,
  versaoDaSessao,
  type Papel,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { assinar } from "@/lib/assinatura";
import { periodoDoMes, somarMeses, type DadosAssinatura } from "@/lib/painel-de-uso";

// Assinaturas do mês no Painel de uso: marcar como paga (só o gestor) e a virada do mês, que leva
// as que renovam para o mês novo como não pagas, sem nunca duplicar.

async function entrarComo(papel: Papel | null) {
  pote.clear();
  if (!papel) return null;
  const usuario = await criarUsuario({
    nome: `Pessoa ${papel}`,
    email: `${randomUUID()}@teste.com`,
    senhaHash: null,
    papel,
    emailConfirmado: true,
  });
  const v = await versaoDaSessao(usuario.id);
  pote.set(
    "clicouai_sessao",
    assinar("sessao", { u: usuario.id, v, j: randomUUID(), t: Date.now(), m: "senha" }, 3_600_000),
  );
  return usuario;
}

function dados(parcial: Partial<DadosAssinatura> = {}): DadosAssinatura {
  return {
    nome: `Serviço ${randomUUID().slice(0, 8)}`,
    categoria: "hospedagem",
    plano: "Pro",
    valorCentavos: 2000,
    moeda: "USD",
    ciclo: "mensal",
    assinadaEm: "2026-01-01",
    renovaEm: null,
    formaPagamento: "",
    responsavel: "",
    linkPainel: null,
    observacoes: "",
    ...parcial,
  };
}

/** A linha da assinatura no mês, ou undefined se ela não está no mês. */
async function noMes(assinaturaId: string, mes: string) {
  return (await listarAssinaturasDoMes(mes)).find((l) => l.assinaturaId === assinaturaId);
}

const MES_ATUAL = periodoDoMes("atual").diaInicio;

describe("somarMeses", () => {
  it("avança e volta na virada do ano", () => {
    expect(somarMeses("2026-12-01", 1)).toBe("2027-01-01");
    expect(somarMeses("2026-01-01", -1)).toBe("2025-12-01");
    expect(somarMeses("2026-11-01", 14)).toBe("2028-01-01");
  });
});

describe("virada do mês", () => {
  // Meses longe no futuro: cada teste usa o seu, sem misturar com os outros.
  it("leva só as que renovam, não pagas, e nunca duplica", async () => {
    const mes = "2040-03-01";
    const renova = await criarAssinatura(dados({ nome: "Vercel" }), null);
    const naoRenova = await criarAssinatura(dados({ nome: "Domínio", ciclo: "anual" }), null);
    const desativada = await criarAssinatura(dados({ nome: "Antiga" }), null);

    await garantirAssinaturasDoMes(mes);
    // Primeira vez: mensal entra renovando, anual não.
    const r1 = (await noMes(renova, mes))!;
    expect(r1).toMatchObject({ renova: true, pagaEm: null, nome: "Vercel", valorCentavos: 2000 });
    expect((await noMes(naoRenova, mes))?.renova).toBe(false);
    expect(await marcarAssinaturaDoMesPaga(r1.id, true, (await entrarComo("admin"))!.id)).toBe(
      true,
    );
    await definirAssinaturaAtiva(desativada, false);

    const seguinte = somarMeses(mes, 1);
    await garantirAssinaturasDoMes(seguinte);
    await garantirAssinaturasDoMes(seguinte);
    await Promise.all([garantirAssinaturasDoMes(seguinte), garantirAssinaturasDoMes(seguinte)]);

    const copia = (await noMes(renova, seguinte))!;
    expect(copia).toMatchObject({ renova: true, pagaEm: null, nome: "Vercel", moeda: "USD" });
    expect(copia.id).not.toBe(r1.id);
    expect(await noMes(naoRenova, seguinte)).toBeUndefined();
    expect(await noMes(desativada, seguinte)).toBeUndefined();
    // O mês anterior continua pago.
    expect((await noMes(renova, mes))?.pagaEm).not.toBeNull();

    const banco = await obterBanco();
    const linhas = await banco
      .select()
      .from(t.assinaturasDoMes)
      .where(eq(t.assinaturasDoMes.assinaturaId, renova));
    expect(linhas.map((l) => l.mes).sort()).toEqual([mes, seguinte]);
    expect(linhas.find((l) => l.mes === seguinte)?.origemId).toBe(r1.id);
  });

  it("a restrição única do banco recusa a mesma assinatura duas vezes no mês", async () => {
    const id = await criarAssinatura(dados(), null);
    const banco = await obterBanco();
    await banco.insert(t.assinaturasDoMes).values({ assinaturaId: id, mes: "2041-05-01" });
    await expect(
      banco.insert(t.assinaturasDoMes).values({ assinaturaId: id, mes: "2041-05-01" }),
    ).rejects.toThrow();
  });

  it("desligar a renovação tira a assinatura do mês seguinte", async () => {
    const mes = "2042-01-01";
    const id = await criarAssinatura(dados(), null);
    await garantirAssinaturasDoMes(mes);
    await definirRenovacaoDoMes((await noMes(id, mes))!.id, false);
    await garantirAssinaturasDoMes(somarMeses(mes, 1));
    expect(await noMes(id, somarMeses(mes, 1))).toBeUndefined();
  });

  it("painel parado por meses: copia do último mês com assinaturas", async () => {
    const mes = "2043-01-01";
    const id = await criarAssinatura(dados(), null);
    await garantirAssinaturasDoMes(mes);
    const depois = somarMeses(mes, 3);
    await garantirAssinaturasDoMes(depois);
    expect((await noMes(id, depois))?.renova).toBe(true);
    expect(await noMes(id, somarMeses(mes, 1))).toBeUndefined();
  });
});

describe("ações: marcar paga e renovação", () => {
  it("fotógrafo e anônimo são recusados, sem mudar nada", async () => {
    const id = await criarAssinatura(dados(), null);
    await garantirAssinaturasDoMes(MES_ATUAL);
    const linha = (await noMes(id, MES_ATUAL))!;
    for (const papel of [null, "fotografo", "cliente"] as const) {
      await entrarComo(papel);
      await expect(marcarAssinaturaPagaAcao(linha.id, true)).rejects.toThrow(/^REDIRECT /);
      await expect(renovarNoProximoMesAcao(linha.id, false)).rejects.toThrow(/^REDIRECT /);
    }
    expect(await noMes(id, MES_ATUAL)).toMatchObject({ pagaEm: null, renova: true });
  });

  it("gestor marca, remarca sem mudar a data e desmarca", async () => {
    await entrarComo("admin");
    const id = await criarAssinatura(dados(), null);
    await garantirAssinaturasDoMes(MES_ATUAL);
    const linha = (await noMes(id, MES_ATUAL))!;

    expect(await marcarAssinaturaPagaAcao(linha.id, true)).toEqual({});
    const paga = (await noMes(id, MES_ATUAL))!;
    expect(paga.pagaEm).not.toBeNull();
    const banco = await obterBanco();
    const [gravada] = await banco
      .select()
      .from(t.assinaturasDoMes)
      .where(eq(t.assinaturasDoMes.id, linha.id));
    expect(gravada.pagaPor).not.toBeNull();

    expect(await marcarAssinaturaPagaAcao(linha.id, true)).toEqual({});
    expect((await noMes(id, MES_ATUAL))?.pagaEm).toBe(paga.pagaEm);

    expect(await marcarAssinaturaPagaAcao(linha.id, false)).toEqual({});
    expect((await noMes(id, MES_ATUAL))?.pagaEm).toBeNull();
  });

  it("recusa id inválido, inexistente e valor que não é booleano", async () => {
    await entrarComo("admin");
    expect(await marcarAssinaturaPagaAcao("1; drop table", true)).toEqual({
      erro: "Assinatura não encontrada.",
    });
    expect(await marcarAssinaturaPagaAcao(randomUUID(), true)).toEqual({
      erro: "Assinatura não encontrada.",
    });
    expect(await marcarAssinaturaPagaAcao(randomUUID(), "sim")).toEqual({
      erro: "Assinatura não encontrada.",
    });
  });

  it("renovação muda só no mês atual", async () => {
    await entrarComo("admin");
    const id = await criarAssinatura(dados(), null);
    await garantirAssinaturasDoMes(MES_ATUAL);
    const atual = (await noMes(id, MES_ATUAL))!;
    expect(await renovarNoProximoMesAcao(atual.id, false)).toEqual({});
    expect((await noMes(id, MES_ATUAL))?.renova).toBe(false);

    const banco = await obterBanco();
    const passado = somarMeses(MES_ATUAL, -1);
    const [antiga] = await banco
      .insert(t.assinaturasDoMes)
      .values({ assinaturaId: id, mes: passado, renova: true })
      .returning();
    expect(await renovarNoProximoMesAcao(antiga.id, false)).toEqual({
      erro: "Só dá para mudar a renovação no mês atual.",
    });
  });

  it("reativar põe a assinatura de volta no mês atual", async () => {
    await entrarComo("admin");
    const id = await criarAssinatura(dados(), null);
    await definirAssinaturaAtiva(id, false);
    const banco = await obterBanco();
    // Já apareceu num mês antigo: a primeira vez não vale mais para ela.
    await banco.insert(t.assinaturasDoMes).values({ assinaturaId: id, mes: "2020-01-01" });
    await garantirAssinaturasDoMes(MES_ATUAL);
    expect(await noMes(id, MES_ATUAL)).toBeUndefined();
    expect(await alternarAssinaturaAcao(id, true)).toEqual({});
    expect((await noMes(id, MES_ATUAL))?.renova).toBe(true);
  });
});
