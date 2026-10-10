import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import { criarUsuario, listarPedidosDoCliente, type Papel } from "@/dados";
// Os ids vêm dos dados de exemplo: são os mesmos que a semente grava no banco (PGlite).
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";

import { criarPedido } from "./pedidos";

const [lia] = fotografos;
const evento = eventos.find(
  (e) =>
    e.fotografoId === lia.id &&
    e.status === "publicado" &&
    e.slug === "corrida-ibirapuera-10k-2026",
)!;
const foto = fotos.find(
  (f) =>
    f.eventoId === evento.id &&
    f.enviadaPor === lia.id &&
    f.status === "pronta" &&
    f.excluidaEm === null &&
    f.precoCentavos === null,
)!;

async function novoUsuario(papel: Papel) {
  return criarUsuario({
    nome: "Conta Teste",
    email: `${crypto.randomUUID()}@teste.com`,
    senhaHash: null,
    papel,
  });
}

function comprar(clienteId: string | null) {
  return criarPedido([foto.id], {
    clienteId,
    nome: "Conta Teste",
    email: "comprador@teste.com",
    whatsapp: null,
    aceitaWhatsapp: false,
    metodo: "pix",
  });
}

describe("conta de fotógrafo não compra fotos (regra no servidor)", () => {
  it.each<Papel>(["fotografo", "admin"])("recusa o pedido de uma conta %s", async (papel) => {
    const usuario = await novoUsuario(papel);
    const resultado = await comprar(usuario.id);
    expect(resultado).toEqual({ ok: false, motivo: "conta_sem_compra" });
    // Nada foi gravado na conta.
    expect(await listarPedidosDoCliente(usuario.id)).toHaveLength(0);
  });

  it("aceita o cliente logado e o convidado", async () => {
    const cliente = await novoUsuario("cliente");
    const doCliente = await comprar(cliente.id);
    expect(doCliente.ok).toBe(true);
    expect(await listarPedidosDoCliente(cliente.id)).toHaveLength(1);

    expect((await comprar(null)).ok).toBe(true);
  });
});
