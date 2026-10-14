import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  colaboradoresDosEventos,
  criarContaDeFotografoSeNaoExistir,
  criarEvento,
  criarUsuario,
  topCliquesDoEvento,
  vendasPorAutor,
} from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

// Rankings de vendas: cada item vendido conta para o AUTOR da foto (dono ou colaborador), só em
// pedido pago. Vale no Top Cliques do evento e no ranking geral da página inicial.

async function fotografoNovo(nome: string) {
  const usuario = await criarUsuario({
    nome,
    email: `${randomUUID().slice(0, 8)}@rankings.com`,
    senhaHash: "x",
    papel: "fotografo",
    emailConfirmado: true,
  });
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: nome,
    slug: `rankings-${randomUUID().slice(0, 8)}`,
  });
  return conta!.id;
}

let ordem = 0;
async function foto(eventoId: string, enviadaPor: string) {
  const banco = await obterBanco();
  const id = randomUUID();
  await banco.insert(t.fotos).values({
    id,
    eventoId,
    enviadaPor,
    chaveOriginal: `originais/${id}.jpg`,
    urlPrevia: `previas/${id}.webp`,
    urlMiniatura: `miniaturas/${id}.webp`,
    nomeArquivo: `R${++ordem}.jpg`,
    largura: 100,
    altura: 100,
    ordem,
    status: "pronta",
  });
  return id;
}

/** Pedido com os itens; `fotografoId` do item é o autor, como `criarPedido` grava. */
async function pedido(
  status: "pago" | "estornado" | "contestado",
  itens: { fotoId: string; fotografoId: string }[],
) {
  const banco = await obterBanco();
  const [p] = await banco
    .insert(t.pedidos)
    .values({
      nomeComprador: "Cliente",
      emailComprador: "cliente@teste.com",
      subtotalCentavos: 1000 * itens.length,
      descontoCentavos: 0,
      totalCentavos: 1000 * itens.length,
      metodo: "pix",
      status,
      expiraEm: new Date(Date.now() + 3_600_000),
      pagoEm: new Date(),
    })
    .returning({ id: t.pedidos.id });
  await banco.insert(t.itensPedido).values(
    itens.map((i) => ({
      pedidoId: p.id,
      ...i,
      precoCentavos: 1000,
      descontoCentavos: 0,
      valorFotografoCentavos: 900,
      valorDonoEventoCentavos: 100,
    })),
  );
}

let dono: string;
let colaborador: string;
let convidadoPendente: string;
let eventoId: string;

beforeAll(async () => {
  dono = await fotografoNovo("Daniel Dono");
  colaborador = await fotografoNovo("Ryan Colaborador");
  convidadoPendente = await fotografoNovo("Pedro Pendente");
  const evento = await criarEvento(dono, {
    categoriaId: categorias[0].id,
    inicioEm: "2026-11-01T08:00:00-03:00",
    fimEm: "2026-11-01T12:00:00-03:00",
    local: "Parque",
    cidade: "Miguel Calmon",
    estado: "BA",
    precoFotoCentavos: 1000,
    precoVideoCentavos: 2000,
    visibilidade: "publico",
    listado: true,
    liberacao: "automatica",
    liberadoEm: null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: "envio",
    titulo: "Montaria feminina",
    slug: `rankings-${randomUUID().slice(0, 8)}`,
  });
  eventoId = evento.id;
  const banco = await obterBanco();
  await banco.insert(t.colaboradores).values([
    { eventoId, fotografoId: colaborador, comissaoDonoPct: 10, aceitoEm: new Date() },
    { eventoId, fotografoId: convidadoPendente, comissaoDonoPct: 10, aceitoEm: null },
  ]);

  const doDono = await foto(eventoId, dono);
  const doColaborador = [
    await foto(eventoId, colaborador),
    await foto(eventoId, colaborador),
    await foto(eventoId, colaborador),
  ];
  // Pagos: dono 1, colaborador 3. Estornado e contestado (dono, 2 itens) não contam.
  await pedido("pago", [{ fotoId: doDono, fotografoId: dono }]);
  await pedido(
    "pago",
    doColaborador.map((fotoId) => ({ fotoId, fotografoId: colaborador })),
  );
  await pedido("estornado", [{ fotoId: doDono, fotografoId: dono }]);
  await pedido("contestado", [{ fotoId: doDono, fotografoId: dono }]);
});

describe("Top Cliques do evento", () => {
  it("dono e colaborador aparecem, cada um com as vendas das próprias fotos", async () => {
    const posicoes = await topCliquesDoEvento(eventoId);
    const de = (id: string) => posicoes.find((p) => p.fotografoId === id);
    expect(de(dono)).toMatchObject({ nome: "Daniel Dono", vendidas: 1, faturadoCentavos: 1000 });
    expect(de(colaborador)).toMatchObject({
      nome: "Ryan Colaborador",
      vendidas: 3,
      faturadoCentavos: 3000,
      enviadas: 3,
    });
    // Nome e avatar reais de todos, sem anonimização.
    expect(posicoes.some((p) => /^Fotógrafo( d+)?$/.test(p.nome))).toBe(false);
    expect(de(dono)?.foto).toBeTruthy();
    expect(de(colaborador)?.foto).toBeTruthy();
    expect(de(colaborador)?.slug).toBeTruthy();
    // Convite pendente e sem venda: fora da equipe.
    expect(de(convidadoPendente)).toBeUndefined();
  });

  it("o colaborador que vendeu mais aparece em primeiro", async () => {
    const posicoes = await topCliquesDoEvento(eventoId);
    expect(posicoes.map((p) => p.fotografoId)).toEqual([colaborador, dono]);
  });

  it("venda estornada ou contestada não conta", async () => {
    const posicoes = await topCliquesDoEvento(eventoId);
    expect(posicoes.find((p) => p.fotografoId === dono)?.vendidas).toBe(1);
  });
});

describe("ranking geral de mais vendidos", () => {
  it("inclui o colaborador pelas vendas das próprias fotos, sem estornos", async () => {
    const vendas = new Map(await vendasPorAutor());
    expect(vendas.get(colaborador)).toBe(3);
    expect(vendas.get(dono)).toBe(1);
    expect(vendas.has(convidadoPendente)).toBe(false);
  });

  it("vem do maior para o menor", async () => {
    const vendas = await vendasPorAutor();
    for (let i = 1; i < vendas.length; i++) {
      expect(vendas[i - 1][1]).toBeGreaterThanOrEqual(vendas[i][1]);
    }
  });

  it("a equipe pública do evento traz só o colaborador aceito, com o perfil público", async () => {
    const equipe = await colaboradoresDosEventos([eventoId]);
    expect(equipe.map((c) => c.fotografo.id)).toEqual([colaborador]);
    expect(equipe[0].fotografo).toMatchObject({ nomePublico: "Ryan Colaborador" });
    expect(Object.keys(equipe[0].fotografo).sort()).toEqual(
      ["avatar", "bio", "capa", "fotoPerfil", "id", "nomePublico", "redesSociais", "slug"].sort(),
    );
  });
});
