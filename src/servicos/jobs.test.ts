import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buscarPedido, listarMensagens, salvarPedido, type PedidoInterno } from "@/dados";
import { fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { rodarJobDePedidos, rodarJobDeRevisao } from "./jobs";
import { linkDoPedido, linkParaRecuperar, pedidoDoLinkParaRecuperar } from "./mensagens";
import { podeAcessar } from "./pedidos";

function pedido(parcial: Partial<PedidoInterno>): PedidoInterno {
  const id = crypto.randomUUID();
  return {
    id,
    clienteId: null,
    emailComprador: `${id}@exemplo.com`,
    nomeComprador: "Ana Teste",
    whatsapp: "11912345678",
    aceitaWhatsapp: true,
    cupomId: null,
    subtotalCentavos: 1990,
    descontoCentavos: 0,
    totalCentavos: 1990,
    metodo: "pix",
    status: "pendente",
    expiraEm: new Date(Date.now() - 60_000).toISOString(),
    pagoEm: null,
    criadoEm: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    tokenAcessoHash: null,
    acessoExpiraEm: null,
    gatewayId: null,
    pix: null,
    lembreteEnviadoEm: null,
    ...parcial,
  };
}

const mensagensDe = async (id: string) =>
  (await listarMensagens(1000)).filter((m) => m.pedidoId === id);

describe("job de pedidos", () => {
  it("expira o pendente vencido e manda o lembrete por e-mail e WhatsApp, uma vez só", async () => {
    const vencido = pedido({});
    await salvarPedido(vencido, []);

    await rodarJobDePedidos();
    expect((await buscarPedido(vencido.id))?.pedido.status).toBe("expirado");
    const enviadas = await mensagensDe(vencido.id);
    expect(enviadas.map((m) => m.canal).sort()).toEqual(["email", "whatsapp"]);
    expect(enviadas[0].tipo).toBe("lembrete");

    await rodarJobDePedidos();
    expect(await mensagensDe(vencido.id)).toHaveLength(2);
  });

  it("não mexe no pendente ainda no prazo e não manda WhatsApp sem consentimento", async () => {
    const noPrazo = pedido({ expiraEm: new Date(Date.now() + 60_000).toISOString() });
    const semWhatsapp = pedido({ aceitaWhatsapp: false });
    await salvarPedido(noPrazo, []);
    await salvarPedido(semWhatsapp, []);

    await rodarJobDePedidos();
    expect((await buscarPedido(noPrazo.id))?.pedido.status).toBe("pendente");
    expect(await mensagensDe(noPrazo.id)).toHaveLength(0);
    expect((await mensagensDe(semWhatsapp.id)).map((m) => m.canal)).toEqual(["email"]);
  });

  it("não manda lembrete de pedido antigo", async () => {
    const antigo = pedido({ criadoEm: "2026-01-01T00:00:00Z" });
    await salvarPedido(antigo, []);
    await rodarJobDePedidos();
    expect(await mensagensDe(antigo.id)).toHaveLength(0);
  });
});

describe("links das mensagens", () => {
  it("o link do pedido dá acesso só àquele pedido", () => {
    const a = pedido({});
    const b = pedido({});
    const token = new URL(linkDoPedido(a.id)).searchParams.get("token") ?? "";
    expect(podeAcessar(a, { token })).toBe(true);
    expect(podeAcessar(b, { token })).toBe(false);
  });

  it("o link de recuperar leva ao pedido certo e não vale como acesso ao pedido", () => {
    const a = pedido({});
    const token = new URL(linkParaRecuperar(a.id)).searchParams.get("token") ?? "";
    expect(pedidoDoLinkParaRecuperar(token)).toBe(a.id);
    expect(podeAcessar(a, { token })).toBe(false);
  });
});

describe("job de revisão: saques em processamento", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Saque em `processando` com um lançamento reservado, direto no banco. */
  async function saqueProcessando(fotografoId: string, gatewayId: string | null) {
    const banco = await obterBanco();
    const id = randomUUID();
    await banco.insert(t.saques).values({
      id,
      fotografoId,
      antecipado: false,
      brutoCentavos: 1000,
      taxaCentavos: 100,
      liquidoCentavos: 900,
      chavePix: "12345678909",
      gatewayId,
      status: "processando",
    });
    // Item de pedido para o lançamento (a tabela exige um).
    const [foto] = await banco.select({ id: t.fotos.id }).from(t.fotos).limit(1);
    const doPedido = pedido({ status: "pago" });
    const item = { id: randomUUID() };
    await salvarPedido(doPedido, [
      {
        id: item.id,
        pedidoId: doPedido.id,
        fotoId: foto.id,
        fotografoId,
        precoCentavos: 1000,
        descontoCentavos: 0,
        valorFotografoCentavos: 1000,
        valorDonoEventoCentavos: 0,
        viaPacote: false,
      },
    ]);
    await banco.insert(t.lancamentos).values({
      fotografoId,
      itemPedidoId: item.id,
      valorCentavos: 1000,
      disponivelEm: new Date("2020-01-01"),
      antecipavelEm: new Date("2020-01-01"),
      saqueId: id,
    });
    return id;
  }

  async function saque(id: string) {
    const banco = await obterBanco();
    const [linha] = await banco.select().from(t.saques).where(eq(t.saques.id, id));
    const lancamentos = await banco
      .select()
      .from(t.lancamentos)
      .where(eq(t.lancamentos.saqueId, id));
    return { status: linha.status, reservados: lancamentos.length };
  }

  it("sem Mercado Pago nem R2 configurados, não faz nada e não quebra", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await rodarJobDeRevisao()).toEqual({
      saquesConferidos: 0,
      fotos: { revisadas: 0, prontas: 0, comErro: 0 },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marca pago o que o Mercado Pago confirma e deixa em processamento o que ficou sem resposta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("MP_ACCESS_TOKEN", "TEST-token");
    vi.stubEnv("MP_AMBIENTE", "teste");
    // Conferência no gateway só vale no saque automático.
    vi.stubEnv("SAQUE_AUTOMATICO", "1");
    const pago = await saqueProcessando(fotografos[0].id, "po-job-pago");
    const semResposta = await saqueProcessando(fotografos[1].id, null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/v1/payouts/po-job-pago/transactions")
          ? new Response(
              JSON.stringify({
                transactions: [{ status: "success", status_detail: "accredited" }],
              }),
            )
          : // Reenvio do saque sem gateway_id: Mercado Pago fora do ar.
            new Response(JSON.stringify({ message: "erro" }), { status: 502 }),
      ),
    );

    const resultado = await rodarJobDeRevisao();
    expect(resultado.saquesConferidos).toBeGreaterThanOrEqual(2);
    expect(await saque(pago)).toEqual({ status: "pago", reservados: 1 });
    // Sem certeza de que o Pix não saiu: continua em processamento e o saldo não volta.
    expect(await saque(semResposta)).toEqual({ status: "processando", reservados: 1 });
  });
});
