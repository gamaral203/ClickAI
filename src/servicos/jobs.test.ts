import { describe, expect, it } from "vitest";

import { buscarPedido, listarMensagens, salvarPedido, type PedidoInterno } from "@/dados";

import { rodarJobDePedidos } from "./jobs";
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
