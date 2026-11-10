import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
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
  dataDaCobrancaDoMes,
  lerCaixaAte,
  definirAssinaturaAtiva,
  definirRenovacaoDoMes,
  garantirAssinaturasDoMes,
  buscarAssinatura,
  listarAssinaturasDoMes,
  reservarAvisosDeVencimento,
  marcarAssinaturaDoMesPaga,
  versaoDaSessao,
  type Papel,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { assinar } from "@/lib/assinatura";
import { periodoFinanceiro } from "@/lib/financeiro-plataforma";
import {
  hojeEmBrasilia,
  itensComUso,
  periodoDoMes,
  rotuloDoMes,
  somarMeses,
  somarMesesAoDia,
  vencimentoExibido,
  type DadosAssinatura,
} from "@/lib/painel-de-uso";
import { lerPainelFinanceiro } from "./financeiro-plataforma";

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
    expect(
      await marcarAssinaturaDoMesPaga(r1.id, true, (await entrarComo("admin"))!.id, {
        cotacaoDezMilesimos: 53495,
        hoje: "2040-03-10",
      }),
    ).toBe("ok");
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

describe("marcar paga lança no Financeiro", () => {
  async function cobrancasDa(assinaturaId: string) {
    const banco = await obterBanco();
    return banco
      .select()
      .from(t.cobrancasDespesa)
      .where(eq(t.cobrancasDespesa.assinaturaId, assinaturaId));
  }

  it("data: hoje no mês atual, último dia num mês passado", () => {
    expect(dataDaCobrancaDoMes("2026-11-01", "2026-11-09")).toBe("2026-11-09");
    expect(dataDaCobrancaDoMes("2026-10-01", "2026-11-09")).toBe("2026-10-31");
    expect(dataDaCobrancaDoMes("2027-01-01", "2026-11-09")).toBe("2027-01-01");
  });

  it("lança uma cobrança paga, desconta nos Gastos e no Resultado, e desfaz ao desmarcar", async () => {
    const gestor = (await entrarComo("admin"))!;
    const id = await criarAssinatura(
      dados({ nome: "Supabase", moeda: "BRL", valorCentavos: 13_990 }),
      null,
    );
    await garantirAssinaturasDoMes(MES_ATUAL);
    const linha = (await noMes(id, MES_ATUAL))!;
    const periodo = periodoFinanceiro("mes");
    const banco = await obterBanco();
    const contarLancamentos = async () =>
      (await banco.select({ n: sql<number>`count(*)::int` }).from(t.lancamentos))[0].n;
    const lancamentosAntes = await contarLancamentos();
    const caixaAntes = await lerCaixaAte(new Date(Date.now() + 86_400_000).toISOString());
    const antes = await lerPainelFinanceiro(periodo);

    expect(await marcarAssinaturaPagaAcao(linha.id, true)).toEqual({});
    const [cobranca, ...outras] = await cobrancasDa(id);
    expect(outras).toHaveLength(0);
    expect(cobranca).toMatchObject({
      status: "paga",
      valorCentavos: 13_990,
      moeda: "BRL",
      valorBrlCentavos: 13_990,
      cotacaoDezMilesimos: null,
      iofCentavos: 0,
      pagoPeloSaldoMp: false,
      data: hojeEmBrasilia(),
      criadoPor: gestor.id,
    });
    expect(cobranca.observacao).toContain("Supabase");
    expect(cobranca.observacao).toContain(rotuloDoMes(MES_ATUAL));
    expect((await noMes(id, MES_ATUAL))?.cobrancaId).toBe(cobranca.id);

    const depois = await lerPainelFinanceiro(periodo);
    expect(depois.despesas.pagasCentavos - antes.despesas.pagasCentavos).toBe(13_990);
    expect(antes.resultadoCentavos - depois.resultadoCentavos).toBe(13_990);
    expect(depois.acumulado.despesasPagasCentavos - antes.acumulado.despesasPagasCentavos).toBe(
      13_990,
    );
    // Só o caixa da plataforma: saldo, lançamentos e saques dos fotógrafos não mudam.
    expect(await contarLancamentos()).toBe(lancamentosAntes);
    expect(await lerCaixaAte(new Date(Date.now() + 86_400_000).toISOString())).toEqual(caixaAntes);

    // Marcar de novo (e ao mesmo tempo) não lança outra.
    await Promise.all([
      marcarAssinaturaPagaAcao(linha.id, true),
      marcarAssinaturaPagaAcao(linha.id, true),
    ]);
    expect(await cobrancasDa(id)).toHaveLength(1);

    expect(await marcarAssinaturaPagaAcao(linha.id, false)).toEqual({});
    expect(await cobrancasDa(id)).toHaveLength(0);
    expect(await noMes(id, MES_ATUAL)).toMatchObject({ pagaEm: null, cobrancaId: null });
    const desfeito = await lerPainelFinanceiro(periodo);
    expect(desfeito.despesas.pagasCentavos).toBe(antes.despesas.pagasCentavos);
    expect(desfeito.resultadoCentavos).toBe(antes.resultadoCentavos);
    expect(await lerCaixaAte(new Date(Date.now() + 86_400_000).toISOString())).toEqual(caixaAntes);
  });

  it("em dólar, converte pela cotação de 4 casas da gestão", async () => {
    const gestor = (await entrarComo("admin"))!;
    const id = await criarAssinatura(dados({ moeda: "USD", valorCentavos: 2000 }), null);
    await garantirAssinaturasDoMes("2044-02-01");
    const linha = (await noMes(id, "2044-02-01"))!;
    const opcoes = { cotacaoDezMilesimos: 53_495, hoje: "2044-02-10" };
    expect(
      await marcarAssinaturaDoMesPaga(linha.id, true, gestor.id, {
        ...opcoes,
        cotacaoDezMilesimos: null,
      }),
    ).toBe("sem-cotacao");
    expect(await cobrancasDa(id)).toHaveLength(0);
    expect(await marcarAssinaturaDoMesPaga(linha.id, true, gestor.id, opcoes)).toBe("ok");
    expect((await cobrancasDa(id))[0]).toMatchObject({
      moeda: "USD",
      valorCentavos: 2000,
      cotacaoDezMilesimos: 53_495,
      valorBrlCentavos: 10_699,
      data: "2044-02-10",
    });
  });

  it("reabrir ou excluir no Financeiro aparece no bloco; marcar de novo reaproveita a cobrança", async () => {
    await entrarComo("admin");
    const id = await criarAssinatura(dados({ moeda: "BRL" }), null);
    await garantirAssinaturasDoMes(MES_ATUAL);
    const linha = (await noMes(id, MES_ATUAL))!;
    await marcarAssinaturaPagaAcao(linha.id, true);
    const [cobranca] = await cobrancasDa(id);
    const banco = await obterBanco();

    await banco
      .update(t.cobrancasDespesa)
      .set({ status: "pendente" })
      .where(eq(t.cobrancasDespesa.id, cobranca.id));
    expect((await noMes(id, MES_ATUAL))?.pagaEm).toBeNull();
    await marcarAssinaturaPagaAcao(linha.id, true);
    const depois = await cobrancasDa(id);
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ id: cobranca.id, status: "paga" });
    expect((await noMes(id, MES_ATUAL))?.pagaEm).not.toBeNull();

    // Excluída no Financeiro: o bloco volta a "não paga"; marcar lança outra.
    await banco.delete(t.cobrancasDespesa).where(eq(t.cobrancasDespesa.id, cobranca.id));
    expect(await noMes(id, MES_ATUAL)).toMatchObject({ pagaEm: null, cobrancaId: null });
    await marcarAssinaturaPagaAcao(linha.id, true);
    expect(await cobrancasDa(id)).toHaveLength(1);
  });
});

describe("vencimento exibido pela conta do mês paga", () => {
  it("avança um ciclo a partir do vencimento pago, sem acumular o fim de mês", () => {
    expect(vencimentoExibido("2026-11-08", "mensal", null)).toEqual({
      renovaEm: "2026-11-08",
      paga: false,
    });
    expect(vencimentoExibido("2026-11-08", "mensal", "2026-11-01")).toEqual({
      renovaEm: "2026-12-08",
      paga: false,
    });
    // Vencimento já depois do mês pago: não muda (não avança duas vezes).
    expect(vencimentoExibido("2026-12-08", "mensal", "2026-11-01").renovaEm).toBe("2026-12-08");
    // Atrasada de meses: chega ao primeiro vencimento depois do mês pago.
    expect(vencimentoExibido("2026-09-30", "uso", "2026-11-01").renovaEm).toBe("2026-12-30");
    expect(vencimentoExibido("2026-11-20", "anual", "2026-11-01").renovaEm).toBe("2027-11-20");
    expect(vencimentoExibido("2026-11-20", "avulsa", "2026-11-01")).toEqual({
      renovaEm: "2026-11-20",
      paga: true,
    });
    expect(vencimentoExibido(null, "mensal", "2026-11-01").renovaEm).toBeNull();
    expect(vencimentoExibido("2027-01-31", "mensal", "2027-01-01").renovaEm).toBe("2027-02-28");
    expect(somarMesesAoDia("2027-01-31", 2)).toBe("2027-03-31");
    expect(somarMesesAoDia("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("marcar paga leva o vencimento ao mês seguinte; desmarcar volta, sem mudar renova_em", async () => {
    const gestor = (await entrarComo("admin"))!;
    const mes = "2041-05-01";
    const id = await criarAssinatura(dados({ renovaEm: "2041-05-08", moeda: "BRL" }), null);
    await garantirAssinaturasDoMes(mes);
    const linha = (await noMes(id, mes))!;
    const opcoes = { cotacaoDezMilesimos: 53495, hoje: "2041-05-09" };
    const exibido = async () => {
      const a = (await buscarAssinatura(id))!;
      expect(a.renovaEm).toBe("2041-05-08");
      return vencimentoExibido(a.renovaEm, a.ciclo, a.ultimoMesPago);
    };

    expect((await exibido()).renovaEm).toBe("2041-05-08");
    expect(await marcarAssinaturaDoMesPaga(linha.id, true, gestor.id, opcoes)).toBe("ok");
    expect((await buscarAssinatura(id))!.ultimoMesPago).toBe(mes);
    expect(await exibido()).toEqual({ renovaEm: "2041-06-08", paga: false });
    // Marcar de novo (idempotente) não avança outra vez.
    expect(await marcarAssinaturaDoMesPaga(linha.id, true, gestor.id, opcoes)).toBe("ok");
    expect((await exibido()).renovaEm).toBe("2041-06-08");

    expect(await marcarAssinaturaDoMesPaga(linha.id, false, gestor.id, opcoes)).toBe("ok");
    expect((await buscarAssinatura(id))!.ultimoMesPago).toBeNull();
    expect(await exibido()).toEqual({ renovaEm: "2041-05-08", paga: false });
  });

  it("conta do mês paga não gera aviso de vencimento; desmarcada, volta a gerar", async () => {
    const gestor = (await entrarComo("admin"))!;
    const mes = "2042-02-01";
    const id = await criarAssinatura(dados({ renovaEm: "2042-02-10", moeda: "BRL" }), null);
    await garantirAssinaturasDoMes(mes);
    const linha = (await noMes(id, mes))!;
    const opcoes = { cotacaoDezMilesimos: 53495, hoje: "2042-02-05" };
    await marcarAssinaturaDoMesPaga(linha.id, true, gestor.id, opcoes);
    const agora = Date.parse("2042-02-09T12:00:00-03:00");
    expect((await reservarAvisosDeVencimento(agora)).some((a) => a.id === id)).toBe(false);
    await marcarAssinaturaDoMesPaga(linha.id, false, gestor.id, opcoes);
    expect((await reservarAvisosDeVencimento(agora)).filter((a) => a.id === id)).toHaveLength(1);
  });
});

describe("itens dos quadros de uso", () => {
  it("Vercel: só os com custo; consumo na cota grátis (US$ 0,00) fica oculto", () => {
    const itens = [
      { nome: "Fluid Active CPU", custoCentavos: 120, quantidade: 3.5 },
      { nome: "Edge Requests", custoCentavos: 0, quantidade: 0 },
      { nome: "Build Minutes", custoCentavos: 0, quantidade: 12 },
      { nome: "Blob", custoCentavos: 0, quantidade: null },
    ];
    const comCusto = itensComUso(itens, (i) => [i.custoCentavos]);
    expect(comCusto.map((i) => i.nome)).toEqual(["Fluid Active CPU"]);
    // Passou a custar: aparece sozinho.
    const depois = itens.map((i) => (i.nome === "Build Minutes" ? { ...i, custoCentavos: 3 } : i));
    expect(itensComUso(depois, (i) => [i.custoCentavos]).map((i) => i.nome)).toEqual([
      "Fluid Active CPU",
      "Build Minutes",
    ]);
    expect(itensComUso([{ bytes: 0 }, { bytes: NaN }], (i) => [i.bytes])).toEqual([]);
    expect(itensComUso([{ bytes: 0 }, { bytes: 10 }], (i) => [i.bytes])).toEqual([{ bytes: 10 }]);
  });
});
