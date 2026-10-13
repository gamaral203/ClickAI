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
  listarMensagens,
} from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { avisarRanking } from "./avisos-ranking";

// Avisos do ranking da equipe depois de uma venda paga: e-mail registrado para quem foi
// ultrapassado e para quem assumiu o 1º lugar, com o colega anônimo ("Fotógrafo N").

async function fotografoNovo(nome: string) {
  const usuario = await criarUsuario({
    nome,
    email: `${randomUUID().slice(0, 8)}@ranking.com`,
    senhaHash: "x",
    papel: "fotografo",
    emailConfirmado: true,
  });
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: nome,
    slug: `ranking-${randomUUID().slice(0, 8)}`,
  });
  return { email: usuario.email, id: conta!.id };
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
    nomeArquivo: `F${++ordem}.jpg`,
    largura: 100,
    altura: 100,
    ordem,
    status: "pronta",
  });
  return id;
}

async function pedidoPago(itens: { fotoId: string; fotografoId: string }[]) {
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
      status: "pago",
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
      valorFotografoCentavos: 1000,
      valorDonoEventoCentavos: 0,
    })),
  );
  return p.id;
}

describe("avisos do ranking da equipe", () => {
  it("avisa quem foi ultrapassado e quem assumiu o 1º lugar, sem revelar o nome", async () => {
    const dono = await fotografoNovo("Ana Dona");
    const colega = await fotografoNovo("Daniel Colega");
    const evento = await criarEvento(dono.id, {
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
      slug: `montaria-${randomUUID().slice(0, 8)}`,
    });
    const banco = await obterBanco();
    await banco.insert(t.colaboradores).values({
      eventoId: evento.id,
      fotografoId: colega.id,
      comissaoDonoPct: 0,
      aceitoEm: new Date(),
    });
    const daDona = await foto(evento.id, dono.id);
    const doColega = [await foto(evento.id, colega.id), await foto(evento.id, colega.id)];

    // A dona sai na frente: 1 a 0.
    await avisarRanking(await pedidoPago([{ fotoId: daDona, fotografoId: dono.id }]));
    // O colega vende 2 de uma vez: passa a dona e assume o 1º lugar.
    const virada = await pedidoPago(doColega.map((fotoId) => ({ fotoId, fotografoId: colega.id })));
    await avisarRanking(virada);

    const doRanking = (await listarMensagens(500)).filter(
      (m) => m.tipo === "ranking" && m.pedidoId === virada,
    );
    const paraDona = doRanking.find((m) => m.para === dono.email);
    const paraColega = doRanking.find((m) => m.para === colega.email);
    expect(paraDona?.texto).toContain(
      "O Fotógrafo 1 passou você e assumiu o 1º lugar no ranking de Montaria feminina",
    );
    expect(paraDona?.texto).not.toContain("Daniel");
    expect(paraColega?.assunto).toBe("Você está em 1º lugar!");
    expect(doRanking).toHaveLength(2);
  });
});
