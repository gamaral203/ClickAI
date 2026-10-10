import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  adicionarColaborador,
  buscarPedido,
  desempenhoDoEvento,
  excluirItem,
  fracaoVendida,
  registrarDownload,
  registrarMetrica,
  relatorioDoEvento,
} from "@/dados";
// Os ids vêm dos dados de exemplo: são os mesmos que a semente grava no banco (PGlite).
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";
import { confirmarPagamento, criarPedido } from "@/servicos/pedidos";

const [lia, pedro, clique] = fotografos;
// Evento da Lia; o Pedro colabora (aceito nos dados de exemplo) e enviou as fotos da chegada.
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const prontas = fotos.filter(
  (f) => f.eventoId === ibirapuera.id && f.status === "pronta" && f.excluidaEm === null,
);
const aVenda = prontas.filter((f) => f.precoCentavos === null);
const daLia = aVenda.filter((f) => f.enviadaPor === lia.id);
const doPedro = aVenda.filter((f) => f.enviadaPor === pedro.id);

/** Cria e paga um pedido; devolve os itens como ficaram gravados (preço, desconto e divisão). */
async function comprar(ids: string[], email: string) {
  const pedido = await criarPedido(ids, {
    clienteId: null,
    nome: "Cliente Teste",
    email,
    whatsapp: null,
    aceitaWhatsapp: false,
    metodo: "pix",
  });
  if (!pedido.ok) throw new Error(`pedido recusado: ${pedido.motivo}`);
  expect(await confirmarPagamento(pedido.pedidoId)).toBe(true);
  return (await buscarPedido(pedido.pedidoId))!.itens;
}

const pago = (i: { precoCentavos: number; descontoCentavos: number }) =>
  i.precoCentavos - i.descontoCentavos;

async function verComo(fotografoId: string) {
  const desempenho = await desempenhoDoEvento(ibirapuera.id, fotografoId);
  if (!desempenho) throw new Error("sem acesso ao desempenho");
  return desempenho;
}

describe("desempenho do evento", () => {
  it("sem vendas, tudo zera sem dividir por zero", async () => {
    const dono = await verComo(lia.id);
    expect(dono.papel).toBe("dono");
    expect(dono.pedidos).toBe(0);
    expect(dono.faturamentoCentavos).toBe(0);
    expect(dono.ticketMedioCentavos).toBe(0);
    expect(dono.maiorPedidoCentavos).toBe(0);
    expect(dono.ultimaVendaEm).toBeNull();
    expect(dono.conversao).toBe(0);
    expect(dono.fotosVendidas).toBe(0);
    expect(dono.fotosCarregadas).toBe(prontas.length);
    expect(dono.ganhos).toMatchObject({ brutoCentavos: 0, taxaCentavos: 0, liquidoCentavos: 0 });
    // O gráfico recebe uma série contínua até hoje, mesmo sem vendas.
    expect(dono.porDia.length).toBeGreaterThanOrEqual(7);
    expect(dono.porDia.every((d) => d.valorCentavos === 0)).toBe(true);

    expect(fracaoVendida(0, 0)).toBeNull();
    expect(fracaoVendida(0, 10)).toBe(0);
    expect(fracaoVendida(3, 12)).toBe(0.25);
    // Foto excluída depois da venda não leva a porcentagem acima de 100%.
    expect(fracaoVendida(5, 4)).toBe(1);
  });

  it("o dono vê o evento inteiro e o colaborador só o que é dele", async () => {
    const itens = await comprar([daLia[0].id, doPedro[0].id], "desempenho-1@exemplo.com");
    const itemLia = itens.find((i) => i.fotografoId === lia.id)!;
    const itemPedro = itens.find((i) => i.fotografoId === pedro.id)!;
    // O Pedro paga comissão à dona do evento (30% nos dados de exemplo).
    expect(itemPedro.valorDonoEventoCentavos).toBeGreaterThan(0);
    const totalPedido = pago(itemLia) + pago(itemPedro);

    const dono = await verComo(lia.id);
    expect(dono.pedidos).toBe(1);
    expect(dono.fotosVendidas).toBe(2);
    expect(dono.faturamentoCentavos).toBe(totalPedido);
    expect(dono.ticketMedioCentavos).toBe(totalPedido);
    expect(dono.maiorPedidoCentavos).toBe(totalPedido);
    expect(dono.ultimaVendaEm).not.toBeNull();
    expect(dono.porMetodo).toEqual({ pix: 1, cartao: 0 });
    expect(dono.ganhos.vendasPropriasCentavos).toBe(itemLia.valorFotografoCentavos);
    expect(dono.ganhos.comissaoComoDonoCentavos).toBe(itemPedro.valorDonoEventoCentavos);
    const brutoDono = itemLia.valorFotografoCentavos + itemPedro.valorDonoEventoCentavos;
    expect(dono.ganhos.brutoCentavos).toBe(brutoDono);
    expect(dono.ganhos.taxaCentavos).toBe(Math.floor((brutoDono * lia.comissaoPct) / 100));
    expect(dono.ganhos.liquidoCentavos).toBe(brutoDono - dono.ganhos.taxaCentavos);
    expect(dono.porDia.at(-1)?.valorCentavos).toBe(totalPedido);

    const colaborador = await verComo(pedro.id);
    expect(colaborador.papel).toBe("colaborador");
    expect(colaborador.pedidos).toBe(1);
    expect(colaborador.fotosVendidas).toBe(1);
    expect(colaborador.fotosCarregadas).toBe(
      prontas.filter((f) => f.enviadaPor === pedro.id).length,
    );
    expect(colaborador.faturamentoCentavos).toBe(pago(itemPedro));
    expect(colaborador.ticketMedioCentavos).toBe(pago(itemPedro));
    expect(colaborador.maiorPedidoCentavos).toBe(pago(itemPedro));
    expect(colaborador.ganhos.vendasPropriasCentavos).toBe(itemPedro.valorFotografoCentavos);
    expect(colaborador.ganhos.comissaoComoDonoCentavos).toBe(0);
    expect(colaborador.ganhos.brutoCentavos).toBe(itemPedro.valorFotografoCentavos);
    expect(colaborador.maisVendidas.map((f) => f.fotoId)).toEqual([doPedro[0].id]);
    expect(colaborador.porDia.at(-1)?.valorCentavos).toBe(pago(itemPedro));
    // O ranking da equipe é o mesmo que ele já vê em Colaborações.
    expect(colaborador.equipe.quantidade).toBeGreaterThanOrEqual(2);
  });

  it("pedido só com fotos do dono não aparece para o colaborador", async () => {
    const itens = await comprar([daLia[1].id, daLia[2].id], "desempenho-2@exemplo.com");
    const total = itens.reduce((s, i) => s + pago(i), 0);

    const dono = await verComo(lia.id);
    expect(dono.pedidos).toBe(2);
    expect(dono.fotosVendidas).toBe(4);
    expect(dono.ticketMedioCentavos).toBe(Math.floor(dono.faturamentoCentavos / 2));
    expect(dono.maiorPedidoCentavos).toBeGreaterThanOrEqual(total);

    const colaborador = await verComo(pedro.id);
    expect(colaborador.pedidos).toBe(1);
    expect(colaborador.fotosVendidas).toBe(1);

    // O relatório em PDF usa as mesmas contas e bate com o que o dono vê.
    const relatorio = await relatorioDoEvento(ibirapuera.id, lia.id);
    expect(relatorio).toMatchObject({
      pedidos: dono.pedidos,
      faturamentoCentavos: dono.faturamentoCentavos,
      ticketMedioCentavos: dono.ticketMedioCentavos,
      parteDoFotografoCentavos: dono.ganhos.brutoCentavos,
      porMetodo: dono.porMetodo,
    });
    expect(await relatorioDoEvento(ibirapuera.id, pedro.id)).toBeNull();
  });

  it("conta as visitas do evento e os downloads só dos itens do escopo", async () => {
    expect(await registrarMetrica("visita_evento", { eventoId: ibirapuera.id })).toBe(true);
    expect(await registrarMetrica("visita_evento", { eventoId: ibirapuera.id })).toBe(true);
    const itens = await comprar([daLia[3].id, doPedro[1].id], "desempenho-3@exemplo.com");
    await registrarDownload(itens.find((i) => i.fotografoId === lia.id)!.id, null);

    let dono = await verComo(lia.id);
    let colaborador = await verComo(pedro.id);
    expect(dono.visitas).toBe(2);
    expect(colaborador.visitas).toBe(2);
    expect(dono.conversao).toBe(dono.pedidos / 2);
    expect(colaborador.conversao).toBe(colaborador.pedidos / 2);
    expect(dono.downloads).toBe(1);
    expect(colaborador.downloads).toBe(0);

    await registrarDownload(itens.find((i) => i.fotografoId === pedro.id)!.id, null);
    dono = await verComo(lia.id);
    colaborador = await verComo(pedro.id);
    expect(dono.downloads).toBe(2);
    expect(colaborador.downloads).toBe(1);
  });

  it("foto excluída depois da venda continua nas vendas, mas sai das carregadas", async () => {
    const antesDono = await verComo(lia.id);
    const antes = await verComo(pedro.id);
    expect(await excluirItem(doPedro[0].id, lia.id)).toBe(true);

    const depoisDono = await verComo(lia.id);
    const depois = await verComo(pedro.id);
    expect(depois.fotosCarregadas).toBe(antes.fotosCarregadas - 1);
    expect(depois.fotosVendidas).toBe(antes.fotosVendidas);
    expect(depois.faturamentoCentavos).toBe(antes.faturamentoCentavos);
    expect(depoisDono.fotosCarregadas).toBe(antesDono.fotosCarregadas - 1);
    expect(depoisDono.fotosVendidas).toBe(antesDono.fotosVendidas);
  });

  it("quem não é dono nem colaborador aceito recebe null", async () => {
    expect(await desempenhoDoEvento(ibirapuera.id, clique.id)).toBeNull();
    // Convite pendente ainda não dá acesso.
    expect(
      await adicionarColaborador(ibirapuera.id, lia.id, {
        fotografoId: clique.id,
        comissaoDonoPct: 20,
        nota: null,
      }),
    ).toBe("ok");
    expect(await desempenhoDoEvento(ibirapuera.id, clique.id)).toBeNull();
    expect(await desempenhoDoEvento(crypto.randomUUID(), lia.id)).toBeNull();
  });
});
