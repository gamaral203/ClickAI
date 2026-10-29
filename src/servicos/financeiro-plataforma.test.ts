import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// O redirect do Next vira um erro com o destino, para o teste ver para onde a pessoa iria.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const pote = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (pote.has(nome) ? { name: nome, value: pote.get(nome)! } : undefined),
    set: (nome: string, valor: string) => pote.set(nome, valor),
    delete: (nome: string) => pote.delete(nome),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.90" }),
}));

import { excluirAssinaturaAcao } from "@/app/(admin)/admin/uso/acoes";
import {
  excluirCobrancaAcao,
  importarDespesasIniciaisAcao,
  salvarCobrancaAcao,
  salvarReferenciasAcao,
  salvarSaldoAcao,
} from "@/app/(admin)/admin/uso/financeiro/acoes";
import {
  buscarPedido,
  criarAssinatura,
  criarUsuario,
  lerConfiguracoesGestao,
  ligarPedidoAoGateway,
  marcarPedidoPago,
  salvarPedido,
  versaoDaSessao,
  type ItemPedido,
  type Papel,
} from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { assinar } from "@/lib/assinatura";
import { DESPESAS_INICIAIS } from "@/lib/despesas-iniciais";
import { periodoFinanceiro } from "@/lib/financeiro-plataforma";

import { lerDecomposicaoDoPedido, lerPainelFinanceiro } from "./financeiro-plataforma";
import { processarNotificacaoDeOrder } from "./pagamentos";
import { confirmarPagamento } from "./pedidos";

// Financeiro da ClicouAí: só o gestor lê e grava (conferido no servidor, também nas ações), a
// importação das despesas iniciais é idempotente e reconcilia o domínio já cadastrado, e a
// confirmação do pagamento grava a taxa do Mercado Pago e os lançamentos numa transação só.

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
  const token = assinar(
    "sessao",
    { u: usuario.id, v, j: randomUUID(), t: Date.now(), m: "senha" },
    60 * 60_000,
  );
  pote.set("clicouai_sessao", token);
  return usuario;
}

function formulario(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

beforeEach(() => {
  pote.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** Pedido Pix pendente com dois itens de R$ 10,00. */
async function pedidoPendente() {
  const banco = await obterBanco();
  const fotos = await banco
    .select({ id: t.fotos.id, autor: t.fotos.enviadaPor })
    .from(t.fotos)
    .where(and(eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm)))
    .limit(2);
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
      expiraEm: new Date(Date.now() + 30 * 60_000).toISOString(),
      pagoEm: null,
      criadoEm: new Date().toISOString(),
      tokenAcessoHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      acessoExpiraEm: null,
      gatewayId: null,
      pix: null,
      lembreteEnviadoEm: null,
    },
    itens,
  );
  return { id, itens };
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

async function taxaGravada(pedidoId: string) {
  const banco = await obterBanco();
  const [p] = await banco
    .select({
      taxa: t.pedidos.taxaGatewayCentavos,
      liquido: t.pedidos.liquidoRecebidoCentavos,
      origem: t.pedidos.taxaGatewayOrigem,
    })
    .from(t.pedidos)
    .where(eq(t.pedidos.id, pedidoId));
  return p;
}

describe("acesso: só o gestor, conferido no servidor", () => {
  const periodo = periodoFinanceiro("mes");

  it.each(["cliente", "fotografo", null] as const)(
    "%s não lê o painel nem grava nada",
    async (papel) => {
      await entrarComo(papel);
      await expect(lerPainelFinanceiro(periodo)).rejects.toThrow(/REDIRECT/);
      await expect(lerDecomposicaoDoPedido(randomUUID())).rejects.toThrow(/REDIRECT/);
      await expect(importarDespesasIniciaisAcao()).rejects.toThrow(/REDIRECT/);
      await expect(
        salvarSaldoAcao({}, formulario({ valor: "1,00", dia: "2026-10-28" })),
      ).rejects.toThrow(/REDIRECT/);
      await expect(
        salvarReferenciasAcao({}, formulario({ pix: "0", cartao: "0", cotacao: "1" })),
      ).rejects.toThrow(/REDIRECT/);
      await expect(
        salvarCobrancaAcao({}, formulario({ assinaturaId: randomUUID() })),
      ).rejects.toThrow(/REDIRECT/);
      await expect(excluirCobrancaAcao(randomUUID(), randomUUID())).rejects.toThrow(/REDIRECT/);
      const banco = await obterBanco();
      const [importadas] = await banco
        .select({ total: sql<number>`count(*)::int` })
        .from(t.assinaturas)
        .where(like(t.assinaturas.chaveImportacao, "inicial:%"));
      // A importação de outros testes (do gestor) pode ter rodado antes; nenhuma veio daqui.
      expect([0, DESPESAS_INICIAIS.length]).toContain(importadas.total);
    },
  );

  it("gestor lê o painel e a decomposição", async () => {
    await entrarComo("admin");
    const painel = await lerPainelFinanceiro(periodo);
    expect(painel.vendas.volumeBrutoCentavos).toBeGreaterThanOrEqual(0);
    expect(painel.evolucao).toHaveLength(12);
    await expect(lerDecomposicaoDoPedido(randomUUID())).resolves.toBeNull();
  });
});

describe("importação das despesas iniciais", () => {
  it("é idempotente e reconcilia o domínio já cadastrado, sem duplicar", async () => {
    const gestor = await entrarComo("admin");
    const banco = await obterBanco();
    const dominioAntigo = await criarAssinatura(
      {
        nome: "Domínio clicouai.com",
        categoria: "dominio",
        plano: "",
        valorCentavos: 500,
        moeda: "USD",
        ciclo: "anual",
        assinadaEm: "2026-10-09",
        renovaEm: "2027-10-09",
        formaPagamento: "",
        responsavel: "",
        linkPainel: null,
        observacoes: "Cadastro antigo.",
      },
      gestor!.id,
    );

    const primeira = await importarDespesasIniciaisAcao();
    expect(primeira.erro).toBeUndefined();
    expect(primeira.resultado?.find((r) => r.item === "Domínio clicouai.com")?.despesa).toBe(
      "atualizada",
    );
    const segunda = await importarDespesasIniciaisAcao();
    expect(segunda.resultado?.every((r) => r.despesa === "ja_existia")).toBe(true);
    expect(segunda.resultado?.every((r) => r.cobrancasNovas === 0)).toBe(true);

    const importadas = await banco
      .select()
      .from(t.assinaturas)
      .where(like(t.assinaturas.chaveImportacao, "inicial:%"));
    expect(importadas).toHaveLength(DESPESAS_INICIAIS.length);
    expect(importadas.some((a) => /workers/i.test(a.nome))).toBe(false);
    const dominio = importadas.find((a) => a.chaveImportacao === "inicial:dominio-clicouai-com")!;
    expect(dominio.id).toBe(dominioAntigo);
    expect(dominio).toMatchObject({ valorCentavos: 1125, moeda: "USD", ciclo: "anual" });
    expect(dominio.observacoes).toContain("Cadastro antigo.");
    expect(dominio.observacoes).toContain("US$ 5/ano");
    const dominios = await banco
      .select({ id: t.assinaturas.id })
      .from(t.assinaturas)
      .where(
        and(eq(t.assinaturas.categoria, "dominio"), like(t.assinaturas.nome, "%clicouai.com")),
      );
    expect(dominios).toHaveLength(1);

    const cobrancas = await banco
      .select()
      .from(t.cobrancasDespesa)
      .where(like(t.cobrancasDespesa.chaveImportacao, "inicial:%"));
    expect(cobrancas).toHaveLength(6);
    const porChave = new Map(cobrancas.map((c) => [c.chaveImportacao, c]));
    expect(porChave.get("inicial:vercel-pro:2026-10")).toMatchObject({
      valorCentavos: 2000,
      cotacaoDezMilesimos: 53_495,
      valorBrlCentavos: 10_699,
      status: "paga",
    });
    expect(porChave.get("inicial:cloudflare-r2:2026-10")).toMatchObject({
      valorBrlCentavos: 1_145,
      status: "provisionada",
    });
    expect(porChave.get("inicial:meta-verified:historica")).toMatchObject({
      valorBrlCentavos: 5_300,
      status: "paga",
      pagoPeloSaldoMp: true,
    });

    // Despesa com histórico não é excluída (o histórico financeiro não some).
    const r = await excluirAssinaturaAcao(dominio.id);
    expect(r.erro).toMatch(/histórico/);
  });
});

describe("cobranças e configurações", () => {
  it("gestor lança, edita e exclui uma cobrança em dólar com IOF", async () => {
    const gestor = await entrarComo("admin");
    const assinaturaId = await criarAssinatura(
      {
        nome: "Serviço de teste",
        categoria: "outros",
        plano: "",
        valorCentavos: 1000,
        moeda: "USD",
        ciclo: "mensal",
        assinadaEm: "2026-10-01",
        renovaEm: null,
        formaPagamento: "",
        responsavel: "",
        linkPainel: null,
        observacoes: "",
      },
      gestor!.id,
    );
    const campos = {
      assinaturaId,
      data: "2026-10-05",
      valor: "10,00",
      moeda: "USD",
      cotacao: "",
      iof: "2,00",
      status: "paga",
      observacao: "teste",
    };
    expect(await salvarCobrancaAcao({}, formulario(campos))).toEqual({ ok: true });
    const banco = await obterBanco();
    const [c] = await banco
      .select()
      .from(t.cobrancasDespesa)
      .where(eq(t.cobrancasDespesa.assinaturaId, assinaturaId));
    const { cotacaoDezMilesimos } = await lerConfiguracoesGestao();
    expect(c).toMatchObject({ cotacaoDezMilesimos, iofCentavos: 200 });
    expect(c.valorBrlCentavos).toBe(Math.round((1000 * cotacaoDezMilesimos) / 10_000));

    expect(
      await salvarCobrancaAcao({}, formulario({ ...campos, cobrancaId: c.id, cotacao: "6,00" })),
    ).toEqual({ ok: true });
    const [editada] = await banco
      .select()
      .from(t.cobrancasDespesa)
      .where(eq(t.cobrancasDespesa.id, c.id));
    expect(editada).toMatchObject({ cotacaoDezMilesimos: 60_000, valorBrlCentavos: 6_000 });

    expect(await excluirCobrancaAcao(c.id, assinaturaId)).toEqual({});
    expect(await excluirAssinaturaAcao(assinaturaId)).toEqual({});
  });

  it("salva o saldo informado e as referências", async () => {
    await entrarComo("admin");
    expect(await salvarSaldoAcao({}, formulario({ valor: "477,00", dia: "2026-10-28" }))).toEqual({
      ok: true,
    });
    expect(
      await salvarReferenciasAcao(
        {},
        formulario({ pix: "0,99", cartao: "4,98", cotacao: "5,3495" }),
      ),
    ).toEqual({ ok: true });
    const config = await lerConfiguracoesGestao();
    expect(config.saldoMp).toMatchObject({ centavos: 47_700, dia: "2026-10-28" });
    expect(config.taxas).toEqual({ pixPb: 99, cartaoPb: 498 });
    expect(config.cotacaoDezMilesimos).toBe(53_495);
    expect(config.cotacaoUsdCentavos).toBe(535);
    expect(
      (await salvarSaldoAcao({}, formulario({ valor: "x", dia: "2026-10-28" }))).erros?.valor,
    ).toBeTruthy();
  });
});

describe("confirmação do pagamento com a taxa", () => {
  it("sem a taxa do Mercado Pago, grava a estimativa (0,99% no Pix) e os lançamentos, uma vez só", async () => {
    const { id, itens } = await pedidoPendente();
    expect(await confirmarPagamento(id)).toBe(true);
    expect(await taxaGravada(id)).toEqual({ taxa: 20, liquido: 1980, origem: "estimada" });
    expect(await lancamentosDo(itens)).toHaveLength(2);
    expect(await confirmarPagamento(id)).toBe(false);
    expect(await lancamentosDo(itens)).toHaveLength(2);
  });

  it("com a taxa lida no pagamento, grava a real", async () => {
    const { id } = await pedidoPendente();
    expect(await confirmarPagamento(id, { taxaCentavos: 21, liquidoCentavos: 1979 })).toBe(true);
    expect(await taxaGravada(id)).toEqual({ taxa: 21, liquido: 1979, origem: "mp" });
  });

  it("pelo webhook, lê a taxa real no GET /v1/payments (só leitura) e grava como `mp`", async () => {
    const { id } = await pedidoPendente();
    const orderId = `ORD${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
    expect(await ligarPedidoAoGateway(id, null, orderId, null)).toBe(true);
    vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
    vi.stubEnv("MP_WEBHOOK_SECRET", "segredo");
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith(`/v1/orders/${orderId}`)) {
          return new Response(
            JSON.stringify({
              id: orderId,
              status: "processed",
              status_detail: "accredited",
              external_reference: id,
              total_amount: "20.00",
              transactions: {
                payments: [{ id: "PAY01", reference_id: "1234567890", status: "processed" }],
              },
            }),
          );
        }
        if (url.endsWith("/v1/payments/1234567890")) {
          return new Response(
            JSON.stringify({
              transaction_amount: 20,
              fee_details: [{ type: "mercadopago_fee", amount: 0.2, fee_payer: "collector" }],
              transaction_details: { net_received_amount: 19.8 },
            }),
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    try {
      expect(await processarNotificacaoDeOrder(orderId)).toBe("pago");
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
    expect(await taxaGravada(id)).toEqual({ taxa: 20, liquido: 1980, origem: "mp" });
    // Só leituras no Mercado Pago: nenhuma cobrança, estorno ou payout.
    expect(chamadas.every((c) => c.startsWith("GET "))).toBe(true);
  });

  it("falha ao gravar os lançamentos desfaz o pago (transação única)", async () => {
    const { id, itens } = await pedidoPendente();
    const ruim = {
      id: randomUUID(),
      fotografoId: randomUUID(), // não existe: a chave estrangeira recusa
      itemPedidoId: itens[0].id,
      valorCentavos: 1000,
      disponivelEm: new Date().toISOString(),
      antecipavelEm: new Date().toISOString(),
      saqueId: null,
    };
    await expect(
      marcarPedidoPago(id, new Date().toISOString(), {
        lancamentos: [ruim],
        taxa: { taxaCentavos: 20, liquidoCentavos: 1980, origem: "estimada" },
      }),
    ).rejects.toThrow();
    expect((await buscarPedido(id))?.pedido.status).toBe("pendente");
    expect(await taxaGravada(id)).toEqual({ taxa: null, liquido: null, origem: null });
    expect(await lancamentosDo(itens)).toHaveLength(0);
  });

  it("a decomposição do pedido pago aparece para o gestor", async () => {
    const { id } = await pedidoPendente();
    await confirmarPagamento(id);
    await entrarComo("admin");
    const d = await lerDecomposicaoDoPedido(id);
    expect(d?.decomposicao).toMatchObject({
      situacao: "receita",
      compradorPagouCentavos: 2000,
      taxaGatewayCentavos: 20,
      taxaOrigem: "estimada",
    });
  });
});
