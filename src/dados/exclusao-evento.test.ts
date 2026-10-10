import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  adicionarItensSimulados,
  buscarEventoDoFotografo,
  criarContaDeFotografo,
  criarEvento,
  criarUsuario,
  excluirEventoSemPedidos,
  mudarStatusDoEvento,
} from "@/dados";
import { eventos } from "@/dados/exemplo/dados";
import { omitir } from "@/dados/mapas";
import { criarPedido } from "@/servicos/pedidos";

const modelo = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;

async function eventoComFotos() {
  const sufixo = randomUUID().slice(0, 8);
  const usuario = await criarUsuario({
    nome: "Fotógrafa Teste",
    email: `exclusao-evento-${sufixo}@exemplo.com`,
    senhaHash: "x",
    papel: "fotografo",
  });
  const conta = await criarContaDeFotografo({
    usuarioId: usuario.id,
    nomePublico: "Fotógrafa Teste",
    slug: `fotografa-${sufixo}`,
  });
  const evento = await criarEvento(conta.id, {
    ...omitir(modelo, "id", "fotografoId", "status", "capa"),
    slug: `evento-excluir-${sufixo}`,
  });
  expect(await mudarStatusDoEvento(evento.id, conta.id, "rascunho", "publicado")).toBe(true);
  const itens = await adicionarItensSimulados(evento.id, conta.id, [
    { nome: "IMG_1.jpg", tamanhoBytes: 1000 },
  ]);
  if (!itens) throw new Error("Não criou as fotos");
  return { conta, evento, itens };
}

describe("excluir evento", () => {
  it("apaga o evento sem pedidos, com as fotos", async () => {
    const { conta, evento } = await eventoComFotos();
    const resultado = await excluirEventoSemPedidos(evento.id, conta.id);
    expect(resultado.ok).toBe(true);
    expect(await buscarEventoDoFotografo(evento.id, conta.id)).toBeNull();
  });

  it("não apaga evento de outro fotógrafo", async () => {
    const { evento } = await eventoComFotos();
    const outro = await eventoComFotos();
    expect(await excluirEventoSemPedidos(evento.id, outro.conta.id)).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
  });

  it("não apaga evento que já tem pedido, mesmo sem pagar", async () => {
    const { conta, evento, itens } = await eventoComFotos();
    const pedido = await criarPedido([itens[0].id], {
      clienteId: null,
      nome: "Maria",
      email: "maria@exemplo.com",
      whatsapp: "11999990000",
      aceitaWhatsapp: false,
      metodo: "pix",
    });
    expect(pedido.ok).toBe(true);
    expect(await excluirEventoSemPedidos(evento.id, conta.id)).toEqual({
      ok: false,
      motivo: "tem_pedidos",
    });
    expect(await buscarEventoDoFotografo(evento.id, conta.id)).not.toBeNull();
  });
});
