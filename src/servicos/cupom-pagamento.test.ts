import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buscarPedido, salvarPedido, type ItemPedido, type PedidoInterno } from "@/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { confirmarPagamento } from "./pedidos";

// Uso do cupom somado na mesma transação que marca o pedido como pago (docs/riscos.md: cupom
// usado além do limite).

async function criarCupom(usosMax: number | null, usos = 0) {
  const banco = await obterBanco();
  const [foto] = await banco
    .select({ fotografoId: t.fotos.enviadaPor })
    .from(t.fotos)
    .where(and(eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm)))
    .limit(1);
  const [cupom] = await banco
    .insert(t.cupons)
    .values({
      fotografoId: foto.fotografoId,
      codigo: `TESTE${randomBytes(4).toString("hex")}`,
      tipo: "percentual",
      valor: 10,
      usosMax,
      usos,
      inicioEm: new Date(Date.now() - 60_000),
    })
    .returning({ id: t.cupons.id });
  return cupom.id;
}

async function usosDo(cupomId: string) {
  const banco = await obterBanco();
  const [cupom] = await banco
    .select({ usos: t.cupons.usos })
    .from(t.cupons)
    .where(eq(t.cupons.id, cupomId));
  return cupom.usos;
}

async function criarPedido(cupomId: string) {
  const banco = await obterBanco();
  const [foto] = await banco
    .select({ id: t.fotos.id, autor: t.fotos.enviadaPor })
    .from(t.fotos)
    .where(and(eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm)))
    .limit(1);
  const id = randomUUID();
  const itens: ItemPedido[] = [
    {
      id: randomUUID(),
      pedidoId: id,
      fotoId: foto.id,
      fotografoId: foto.autor,
      precoCentavos: 1000,
      descontoCentavos: 100,
      valorFotografoCentavos: 900,
      valorDonoEventoCentavos: 0,
      viaPacote: false,
    },
  ];
  const pedido: PedidoInterno = {
    id,
    clienteId: null,
    emailComprador: `${id}@exemplo.com`,
    nomeComprador: "Ana Teste",
    whatsapp: null,
    aceitaWhatsapp: false,
    cupomId,
    subtotalCentavos: 1000,
    descontoCentavos: 100,
    totalCentavos: 900,
    metodo: "pix",
    status: "pendente",
    expiraEm: new Date(Date.now() + 60 * 60_000).toISOString(),
    pagoEm: null,
    criadoEm: new Date().toISOString(),
    tokenAcessoHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
    acessoExpiraEm: null,
    gatewayId: null,
    pix: null,
    lembreteEnviadoEm: null,
  };
  await salvarPedido(pedido, itens);
  return id;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uso do cupom no pagamento", () => {
  it("soma o uso uma vez só, mesmo com o webhook repetido", async () => {
    const cupom = await criarCupom(5);
    const pedido = await criarPedido(cupom);
    expect(await confirmarPagamento(pedido)).toBe(true);
    expect(await confirmarPagamento(pedido)).toBe(false);
    expect(await confirmarPagamento(pedido)).toBe(false);
    expect(await usosDo(cupom)).toBe(1);
  });

  it("confirmações simultâneas do mesmo pedido somam um uso só", async () => {
    const cupom = await criarCupom(null);
    const pedido = await criarPedido(cupom);
    const resultados = await Promise.all([1, 2, 3, 4].map(() => confirmarPagamento(pedido)));
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(await usosDo(cupom)).toBe(1);
  });

  it("nunca passa do limite com pedidos simultâneos; todos continuam pagos", async () => {
    const alerta = vi.spyOn(console, "error").mockImplementation(() => {});
    const cupom = await criarCupom(2);
    const pedidos = await Promise.all([1, 2, 3].map(() => criarPedido(cupom)));
    const resultados = await Promise.all(pedidos.map((p) => confirmarPagamento(p)));
    expect(resultados).toEqual([true, true, true]);
    expect(await usosDo(cupom)).toBe(2);
    for (const p of pedidos) expect((await buscarPedido(p))?.pedido.status).toBe("pago");
    // O que estourou o limite fica registrado como alerta, sem estorno.
    expect(
      alerta.mock.calls.filter((c) => String(c[0]).includes("cupom usado além do limite")),
    ).toHaveLength(1);
  });

  it("cupom esgotado entre a criação e o pagamento: pedido pago, uso não passa do limite", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cupom = await criarCupom(1, 1);
    const pedido = await criarPedido(cupom);
    expect(await confirmarPagamento(pedido)).toBe(true);
    expect((await buscarPedido(pedido))?.pedido.status).toBe("pago");
    expect(await usosDo(cupom)).toBe(1);
  });
});
