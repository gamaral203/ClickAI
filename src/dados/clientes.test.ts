import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  criarContaDeFotografoSeNaoExistir,
  criarEvento,
  criarUsuario,
  emailDaContaExcluida,
  listarClientesDoFotografo,
  NOME_CONTA_EXCLUIDA,
} from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { gerarHashSenha } from "@/lib/senha";

// Meus clientes: quem comprou as fotos de um fotógrafo. Só as fotos que ele enviou e só pedidos
// pagos; o cliente é o e-mail do pedido, sem diferenciar maiúsculas.

async function fotografoNovo(nome: string) {
  const usuario = await criarUsuario({
    nome,
    email: `${randomUUID()}@teste.com`,
    senhaHash: gerarHashSenha("senha-de-teste-123"),
    papel: "fotografo",
    emailConfirmado: true,
  });
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: nome,
    slug: `${nome.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}`,
  });
  return conta!;
}

async function novoEvento(fotografoId: string, titulo: string) {
  return criarEvento(fotografoId, {
    categoriaId: categorias[0].id,
    inicioEm: "2026-11-01T08:00:00-03:00",
    fimEm: "2026-11-01T12:00:00-03:00",
    local: "Parque",
    cidade: "São Paulo",
    estado: "SP",
    precoFotoCentavos: 1500,
    precoVideoCentavos: 3000,
    visibilidade: "publico",
    listado: true,
    liberacao: "automatica",
    liberadoEm: null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: "envio",
    titulo,
    slug: `clientes-${randomUUID().slice(0, 8)}`,
  });
}

let ordem = 0;
async function novaFoto(eventoId: string, enviadaPor: string) {
  const banco = await obterBanco();
  const id = randomUUID();
  await banco.insert(t.fotos).values({
    id,
    eventoId,
    enviadaPor,
    chaveOriginal: `originais/${enviadaPor}/${eventoId}/${id}.jpg`,
    urlPrevia: `previas/${id}.webp`,
    urlMiniatura: `miniaturas/${id}.webp`,
    nomeArquivo: `Foto ${String(++ordem).padStart(3, "0")}.JPG`,
    largura: 3000,
    altura: 2000,
    tamanhoBytes: 5_000_000,
    ordem,
    status: "pronta",
  });
  return id;
}

type StatusPedido = (typeof t.statusPedido.enumValues)[number];

/** Pedido gravado direto no banco, com o status e a data de pagamento pedidos. */
async function pedido(dados: {
  nome: string;
  email: string;
  pagoEm: string;
  itens: { fotoId: string; fotografoId: string }[];
  status?: StatusPedido;
}) {
  const banco = await obterBanco();
  const status = dados.status ?? "pago";
  const [criado] = await banco
    .insert(t.pedidos)
    .values({
      nomeComprador: dados.nome,
      emailComprador: dados.email,
      subtotalCentavos: 1500 * dados.itens.length,
      descontoCentavos: 0,
      totalCentavos: 1500 * dados.itens.length,
      metodo: "pix",
      status,
      expiraEm: new Date(Date.parse(dados.pagoEm) + 60 * 60_000),
      pagoEm: status === "pendente" ? null : new Date(dados.pagoEm),
      criadoEm: new Date(dados.pagoEm),
    })
    .returning({ id: t.pedidos.id });
  await banco.insert(t.itensPedido).values(
    dados.itens.map((i) => ({
      pedidoId: criado.id,
      fotoId: i.fotoId,
      fotografoId: i.fotografoId,
      precoCentavos: 1500,
      descontoCentavos: 0,
      valorFotografoCentavos: 1500,
      valorDonoEventoCentavos: 0,
    })),
  );
  return criado.id;
}

describe("Meus clientes", () => {
  it("agrupa por e-mail, com cada compra separada e só os pedidos pagos", async () => {
    const lia = await fotografoNovo("Lia Clientes");
    const evento = await novoEvento(lia.id, "Corrida dos Clientes");
    const f1 = await novaFoto(evento.id, lia.id);
    const f2 = await novaFoto(evento.id, lia.id);
    const f3 = await novaFoto(evento.id, lia.id);
    const daLia = (fotoId: string) => ({ fotoId, fotografoId: lia.id });

    await pedido({
      nome: "Ana",
      email: "Ana@Teste.com",
      pagoEm: "2026-10-01T12:00:00.000Z",
      itens: [daLia(f1)],
    });
    // A mesma pessoa de novo (o e-mail com outra caixa), com o nome completo: vale o nome do
    // pedido mais recente, e cada compra fica separada.
    await pedido({
      nome: "Ana Souza",
      email: "ana@teste.com",
      pagoEm: "2026-10-05T12:00:00.000Z",
      itens: [daLia(f1), daLia(f2)],
    });
    await pedido({
      nome: "Bruno",
      email: "bruno@teste.com",
      pagoEm: "2026-10-03T12:00:00.000Z",
      itens: [daLia(f3)],
    });
    // Pendente e estornado não contam.
    await pedido({
      nome: "Carla",
      email: "carla@teste.com",
      pagoEm: "2026-10-06T12:00:00.000Z",
      itens: [daLia(f2)],
      status: "pendente",
    });
    await pedido({
      nome: "Duda",
      email: "duda@teste.com",
      pagoEm: "2026-10-07T12:00:00.000Z",
      itens: [daLia(f3)],
      status: "estornado",
    });
    // Quem excluiu a conta: o pedido guarda só o marcador.
    await pedido({
      nome: NOME_CONTA_EXCLUIDA,
      email: emailDaContaExcluida(randomUUID()),
      pagoEm: "2026-09-30T12:00:00.000Z",
      itens: [daLia(f2)],
    });

    const clientes = await listarClientesDoFotografo(lia.id);
    expect(clientes.map((c) => c.nome)).toEqual(["Ana Souza", "Bruno", NOME_CONTA_EXCLUIDA]);
    const [ana, bruno, excluida] = clientes;
    expect(ana).toMatchObject({
      email: "ana@teste.com",
      totalFotos: 3,
      ultimaCompraEm: "2026-10-05T12:00:00.000Z",
    });
    // Da compra mais recente para a mais antiga, cada uma com a hora do pagamento.
    expect(ana.compras.map((c) => [c.compradaEm, c.fotos.map((f) => f.fotoId)])).toEqual([
      ["2026-10-05T12:00:00.000Z", [f1, f2]],
      ["2026-10-01T12:00:00.000Z", [f1]],
    ]);
    expect(ana.compras[0].fotos[0]).toMatchObject({
      eventoId: evento.id,
      eventoTitulo: "Corrida dos Clientes",
      tipo: "foto",
    });
    expect(bruno.compras.map((c) => c.fotos.map((f) => f.fotoId))).toEqual([[f3]]);
    expect(excluida.email).toBeNull();
    expect(excluida.compras.map((c) => c.fotos.map((f) => f.fotoId))).toEqual([[f2]]);
  });

  it("no evento colaborativo, cada fotógrafo vê só os clientes das fotos que enviou", async () => {
    const dono = await fotografoNovo("Dono Clientes");
    const colaborador = await fotografoNovo("Colaborador Clientes");
    const evento = await novoEvento(dono.id, "Festival Colaborativo");
    const doDono = await novaFoto(evento.id, dono.id);
    const doColaborador = await novaFoto(evento.id, colaborador.id);

    await pedido({
      nome: "Eva",
      email: "eva@teste.com",
      pagoEm: "2026-10-08T12:00:00.000Z",
      itens: [
        { fotoId: doDono, fotografoId: dono.id },
        { fotoId: doColaborador, fotografoId: colaborador.id },
      ],
    });
    await pedido({
      nome: "Fábio",
      email: "fabio@teste.com",
      pagoEm: "2026-10-09T12:00:00.000Z",
      itens: [{ fotoId: doDono, fotografoId: dono.id }],
    });

    const doColaboradorLista = await listarClientesDoFotografo(colaborador.id);
    expect(doColaboradorLista.map((c) => c.nome)).toEqual(["Eva"]);
    expect(doColaboradorLista[0].compras[0].fotos.map((f) => f.fotoId)).toEqual([doColaborador]);

    const doDonoLista = await listarClientesDoFotografo(dono.id);
    expect(doDonoLista.map((c) => c.nome)).toEqual(["Fábio", "Eva"]);
    expect(doDonoLista[1].compras[0].fotos.map((f) => f.fotoId)).toEqual([doDono]);
  });

  it("sem venda, a lista vem vazia", async () => {
    const semVendas = await fotografoNovo("Sem Vendas Clientes");
    expect(await listarClientesDoFotografo(semVendas.id)).toEqual([]);
  });
});
