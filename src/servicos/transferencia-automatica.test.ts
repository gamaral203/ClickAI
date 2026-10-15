import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Transferência automática e configuração do recebimento, no banco de teste (PGlite).

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  atualizarContaDoFotografo,
  buscarContaDoFotografo,
  criarContaDeFotografo,
  criarUsuario,
  listarSaquesDoFotografo,
  mudarStatusSaque,
  reservarLancamentosParaSaque,
  salvarLancamentos,
  salvarPedido,
  type ItemPedido,
  type MetodoPagamento,
  type PedidoInterno,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { lancamentosDaVenda } from "./pedidos";
import {
  salvarAntecipacao,
  salvarTransferenciaAutomatica,
  solicitarSaque,
  transferirAutomaticamente,
} from "./saques";

const DIA = 24 * 60 * 60 * 1000;
const CPF = "52998224725";

beforeEach(() => {
  vi.stubEnv("MP_ACCESS_TOKEN", "");
  vi.stubEnv("SAQUE_AUTOMATICO", "");
  vi.stubEnv("SAQUE_SEM_PRAZO_EMAILS", "");
});

/** Fotógrafo com CPF e (por padrão) chave Pix confirmada. */
async function fotografo({ chave = true } = {}) {
  const usuario = await criarUsuario({
    nome: "Fotógrafa Teste",
    email: `${randomUUID()}@teste.com`,
    senhaHash: null,
    papel: "fotografo",
    emailConfirmado: true,
  });
  await criarContaDeFotografo({
    usuarioId: usuario.id,
    nomePublico: "Fotógrafa Teste",
    slug: `teste-${randomUUID().slice(0, 8)}`,
  });
  await atualizarContaDoFotografo(usuario.id, { cpfCnpj: CPF, chavePix: chave ? CPF : null });
  return { usuario, conta: (await buscarContaDoFotografo(usuario.id))! };
}

const recarregar = async (usuarioId: string) => (await buscarContaDoFotografo(usuarioId))!;

/** Pedido pago em `pagoEm` com um item do fotógrafo; devolve o item. */
async function pedidoPago(
  fotografoId: string,
  valorCentavos: number,
  metodo: MetodoPagamento,
  pagoEm: number,
): Promise<ItemPedido> {
  const banco = await obterBanco();
  const [foto] = await banco.select({ id: t.fotos.id }).from(t.fotos).limit(1);
  const pedidoId = randomUUID();
  const item: ItemPedido = {
    id: randomUUID(),
    pedidoId,
    fotoId: foto.id,
    fotografoId,
    precoCentavos: valorCentavos,
    descontoCentavos: 0,
    valorFotografoCentavos: valorCentavos,
    valorDonoEventoCentavos: 0,
    viaPacote: false,
  };
  await salvarPedido(
    {
      id: pedidoId,
      clienteId: null,
      emailComprador: `${pedidoId}@exemplo.com`,
      nomeComprador: "Cliente",
      whatsapp: null,
      aceitaWhatsapp: false,
      cupomId: null,
      subtotalCentavos: valorCentavos,
      descontoCentavos: 0,
      totalCentavos: valorCentavos,
      metodo,
      status: "pago",
      expiraEm: new Date(pagoEm).toISOString(),
      pagoEm: new Date(pagoEm).toISOString(),
      criadoEm: new Date(pagoEm).toISOString(),
      tokenAcessoHash: null,
      acessoExpiraEm: null,
      gatewayId: null,
      pix: null,
      lembreteEnviadoEm: null,
    } satisfies PedidoInterno,
    [item],
  );
  return item;
}

/** Venda com o lançamento bruto gravado como lancamentosDaVenda faria (prazo pelo método). */
async function venda(
  fotografoId: string,
  valorCentavos: number,
  metodo: MetodoPagamento,
  pagoEm: number,
) {
  const item = await pedidoPago(fotografoId, valorCentavos, metodo, pagoEm);
  await salvarLancamentos([
    {
      id: randomUUID(),
      fotografoId,
      itemPedidoId: item.id,
      valorCentavos,
      disponivelEm: new Date(pagoEm + (metodo === "pix" ? DIA : 30 * DIA)).toISOString(),
      antecipavelEm: new Date(pagoEm + DIA).toISOString(),
      saqueId: null,
    },
  ]);
}

describe("prazo das vendas novas", () => {
  it("Pix fica disponível 1 dia depois do pagamento; cartão, em 30 dias", async () => {
    const { conta } = await fotografo();
    const agora = Date.now();
    const pix = await pedidoPago(conta.id, 1_000, "pix", agora);
    const cartao = await pedidoPago(conta.id, 1_000, "cartao", agora);
    const [lPix] = await lancamentosDaVenda([pix], agora, "pix");
    const [lCartao] = await lancamentosDaVenda([cartao], agora, "cartao");
    expect(new Date(lPix.disponivelEm).getTime() - agora).toBe(DIA);
    expect(new Date(lPix.antecipavelEm).getTime() - agora).toBe(DIA);
    expect(lPix.valorCentavos).toBe(1_000);
    expect(new Date(lCartao.disponivelEm).getTime() - agora).toBe(30 * DIA);
    expect(new Date(lCartao.antecipavelEm).getTime() - agora).toBe(DIA);
  });
});

describe("configuração do recebimento", () => {
  it("valida os valores e só reinicia a contagem ao ligar", async () => {
    const { conta, usuario } = await fotografo();
    expect(await salvarAntecipacao(conta, "sim")).toEqual({ ok: false, motivo: "invalido" });
    expect(
      await salvarTransferenciaAutomatica(conta, { ligada: true, frequencia: "anual" }),
    ).toEqual({ ok: false, motivo: "invalido" });
    expect(
      await salvarTransferenciaAutomatica(conta, { ligada: "sim", frequencia: "diaria" }),
    ).toEqual({ ok: false, motivo: "invalido" });

    const padrao = await recarregar(usuario.id);
    expect(padrao).toMatchObject({
      anteciparCartao: false,
      transferenciaAutomatica: false,
      frequenciaTransferencia: "semanal",
      transferenciaAutomaticaDesde: null,
      ultimaTransferenciaAutomaticaEm: null,
    });

    expect(await salvarAntecipacao(conta, true)).toMatchObject({
      ok: true,
      conta: { anteciparCartao: true },
    });
    const ligouEm = Date.now() - 5 * DIA;
    await salvarTransferenciaAutomatica(conta, { ligada: true, frequencia: "diaria" }, ligouEm);
    // Mudar a frequência com ela ligada não reinicia a contagem.
    const r = await salvarTransferenciaAutomatica(
      conta,
      { ligada: true, frequencia: "mensal" },
      Date.now(),
    );
    expect(r).toMatchObject({
      ok: true,
      conta: {
        transferenciaAutomatica: true,
        frequenciaTransferencia: "mensal",
        transferenciaAutomaticaDesde: new Date(ligouEm).toISOString(),
      },
    });
    const desligada = await salvarTransferenciaAutomatica(conta, {
      ligada: false,
      frequencia: "mensal",
    });
    expect(desligada).toMatchObject({
      ok: true,
      conta: { transferenciaAutomatica: false, transferenciaAutomaticaDesde: null },
    });
  });
});

describe("transferência automática", () => {
  it("diária: cria o pedido com o saldo disponível, uma vez por intervalo", async () => {
    const { conta, usuario } = await fotografo();
    const agora = Date.now();
    await venda(conta.id, 10_000, "pix", agora - 2 * DIA);
    await venda(conta.id, 10_000, "cartao", agora - 10 * DIA);
    await salvarTransferenciaAutomatica(
      conta,
      { ligada: true, frequencia: "diaria" },
      agora - 2 * DIA,
    );

    const resultado = await transferirAutomaticamente(agora);
    expect(resultado.criadas).toBeGreaterThanOrEqual(1);
    let saques = await listarSaquesDoFotografo(conta.id);
    expect(saques).toHaveLength(1);
    // Só o Pix: o cartão de 10 dias espera os 30 (antecipação desligada).
    expect(saques[0]).toMatchObject({
      status: "processando",
      antecipado: false,
      brutoCentavos: 10_000,
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 0,
      taxaCentavos: 800,
      liquidoCentavos: 9_200,
      chavePix: CPF,
    });
    expect((await recarregar(usuario.id)).ultimaTransferenciaAutomaticaEm).toBe(
      new Date(agora).toISOString(),
    );

    // Rodar de novo logo depois não cria outro.
    await transferirAutomaticamente(agora + 60_000);
    expect(await listarSaquesDoFotografo(conta.id)).toHaveLength(1);

    // A equipe paga; no dia seguinte o cartão ainda não tem 30 dias: abaixo do mínimo, nada sai.
    await mudarStatusSaque(saques[0].id, "processando", "pago", {
      pagoEm: new Date(agora).toISOString(),
    });
    const amanha = agora + DIA + 60_000;
    expect((await transferirAutomaticamente(amanha)).puladas.abaixo_do_minimo).toBeGreaterThan(0);
    expect(await listarSaquesDoFotografo(conta.id)).toHaveLength(1);

    // Com a antecipação ligada, o cartão sai com 8,00 + 1,99.
    await salvarAntecipacao(conta, true);
    await transferirAutomaticamente(amanha + 60_000);
    saques = await listarSaquesDoFotografo(conta.id);
    expect(saques).toHaveLength(2);
    expect(saques.find((s) => s.status === "processando")).toMatchObject({
      antecipado: true,
      brutoCentavos: 10_000,
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 199,
      taxaCentavos: 999,
      liquidoCentavos: 9_001,
    });
  });

  it("semanal: só 7 dias depois de ligar", async () => {
    const { conta } = await fotografo();
    const agora = Date.now();
    await venda(conta.id, 5_000, "pix", agora - 3 * DIA);
    await salvarTransferenciaAutomatica(
      conta,
      { ligada: true, frequencia: "semanal" },
      agora - 3 * DIA,
    );
    await transferirAutomaticamente(agora);
    expect(await listarSaquesDoFotografo(conta.id)).toHaveLength(0);
    await transferirAutomaticamente(agora + 4 * DIA);
    const [saque] = await listarSaquesDoFotografo(conta.id);
    expect(saque).toMatchObject({ brutoCentavos: 5_000, liquidoCentavos: 4_600 });
  });

  it("mensal: 30 dias desde a última transferência", async () => {
    const { conta, usuario } = await fotografo();
    const agora = Date.now();
    await venda(conta.id, 5_000, "pix", agora - 2 * DIA);
    await salvarTransferenciaAutomatica(
      conta,
      { ligada: true, frequencia: "mensal" },
      agora - 40 * DIA,
    );
    const banco = await obterBanco();
    await banco
      .update(t.fotografos)
      .set({ ultimaTransferenciaAutomaticaEm: new Date(agora - 29 * DIA) })
      .where(eq(t.fotografos.id, conta.id));
    await transferirAutomaticamente(agora);
    expect(await listarSaquesDoFotografo(conta.id)).toHaveLength(0);
    await transferirAutomaticamente(agora + DIA);
    expect(await listarSaquesDoFotografo(conta.id)).toHaveLength(1);
    expect((await recarregar(usuario.id)).ultimaTransferenciaAutomaticaEm).toBe(
      new Date(agora + DIA).toISOString(),
    );
  });

  it("pula sem chave, abaixo do mínimo, em andamento, bloqueio de 24 h e demonstração, sem parar o job", async () => {
    const agora = Date.now();
    const ligar = async (conta: { id: string }) =>
      salvarTransferenciaAutomatica(conta, { ligada: true, frequencia: "diaria" }, agora - 2 * DIA);
    const banco = await obterBanco();

    const semChave = (await fotografo({ chave: false })).conta;
    await venda(semChave.id, 10_000, "pix", agora - 2 * DIA);
    await ligar(semChave);

    const pouco = (await fotografo()).conta;
    await venda(pouco.id, 100, "pix", agora - 2 * DIA);
    await ligar(pouco);

    const emAndamento = await fotografo();
    await venda(emAndamento.conta.id, 10_000, "pix", agora - 3 * DIA);
    expect((await solicitarSaque(emAndamento.conta, emAndamento.usuario, agora)).ok).toBe(true);
    await venda(emAndamento.conta.id, 10_000, "pix", agora - 2 * DIA);
    await ligar(emAndamento.conta);

    const trocou = (await fotografo()).conta;
    await venda(trocou.id, 10_000, "pix", agora - 2 * DIA);
    await banco
      .update(t.fotografos)
      .set({ documentoTrocadoEm: new Date(agora - 60 * 60 * 1000) })
      .where(eq(t.fotografos.id, trocou.id));
    await ligar(trocou);

    const demo = (await fotografo()).conta;
    await venda(demo.id, 10_000, "pix", agora - 2 * DIA);
    await banco
      .update(t.fotografos)
      .set({ demonstracao: true })
      .where(eq(t.fotografos.id, demo.id));
    await ligar(demo);

    const boa = (await fotografo()).conta;
    await venda(boa.id, 10_000, "pix", agora - 2 * DIA);
    await ligar(boa);

    const resultado = await transferirAutomaticamente(agora);
    expect(resultado.falhas).toBe(0);
    expect(resultado.puladas.sem_chave).toBeGreaterThanOrEqual(1);
    expect(resultado.puladas.abaixo_do_minimo).toBeGreaterThanOrEqual(1);
    expect(resultado.puladas.saque_em_andamento).toBeGreaterThanOrEqual(1);
    expect(resultado.puladas.documento_trocado).toBeGreaterThanOrEqual(1);

    expect(await listarSaquesDoFotografo(semChave.id)).toHaveLength(0);
    expect(await listarSaquesDoFotografo(pouco.id)).toHaveLength(0);
    expect(await listarSaquesDoFotografo(emAndamento.conta.id)).toHaveLength(1);
    expect(await listarSaquesDoFotografo(trocou.id)).toHaveLength(0);
    expect(await listarSaquesDoFotografo(demo.id)).toHaveLength(0);
    expect(await listarSaquesDoFotografo(boa.id)).toHaveLength(1);
    // Pulada não marca a data: tenta de novo na próxima execução.
    const [linha] = await banco
      .select({ ultima: t.fotografos.ultimaTransferenciaAutomaticaEm })
      .from(t.fotografos)
      .where(eq(t.fotografos.id, semChave.id));
    expect(linha.ultima).toBeNull();
  });
});

describe("saques anteriores à migração 0038", () => {
  it("a taxa gravada é separada em comissão e antecipação sem mudar nenhum valor", async () => {
    const { conta } = await fotografo();
    const legado = (id: string, antecipado: boolean, bruto: number, taxa: number) => ({
      id,
      fotografoId: conta.id,
      antecipado,
      brutoCentavos: bruto,
      taxaCentavos: taxa,
      // Como ficaram depois do ALTER TABLE, antes do UPDATE.
      comissaoCentavos: 0,
      taxaAntecipacaoCentavos: 0,
      liquidoCentavos: bruto - taxa,
      chavePix: CPF,
      gatewayId: null,
      status: "pago" as const,
      criadoEm: new Date().toISOString(),
      pagoEm: new Date().toISOString(),
    });
    // Antecipado antigo: 8% de 10.000 + 9,99% de 5.000 = 800 + 499.
    const antecipado = legado(randomUUID(), true, 15_000, 1_299);
    const normal = legado(randomUUID(), false, 10_000, 800);
    expect(await reservarLancamentosParaSaque(antecipado, [])).toBe(true);
    expect(await reservarLancamentosParaSaque(normal, [])).toBe(true);

    // Roda o UPDATE da migração só nestes dois saques.
    const migracao = readFileSync(
      path.join(process.cwd(), "src", "db", "migracoes", "0038_financeiro_v2.sql"),
      "utf8",
    );
    const update = migracao
      .split("--> statement-breakpoint")
      .at(-1)!
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "");
    const banco = await obterBanco();
    await banco.execute(sql.raw(`${update} AND s."id" IN ('${antecipado.id}', '${normal.id}')`));

    const saques = await listarSaquesDoFotografo(conta.id);
    expect(saques.find((s) => s.id === antecipado.id)).toMatchObject({
      brutoCentavos: 15_000,
      taxaCentavos: 1_299,
      liquidoCentavos: 13_701,
      comissaoCentavos: 1_200,
      taxaAntecipacaoCentavos: 99,
    });
    expect(saques.find((s) => s.id === normal.id)).toMatchObject({
      brutoCentavos: 10_000,
      taxaCentavos: 800,
      liquidoCentavos: 9_200,
      comissaoCentavos: 800,
      taxaAntecipacaoCentavos: 0,
    });
  });
});
