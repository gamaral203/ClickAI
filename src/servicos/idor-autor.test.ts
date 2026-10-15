import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }),
}));
// As rotas leem a sessão; o resto do módulo (contaDoPainel) continua o de verdade.
const sessao = vi.hoisted(() => ({ usuario: null as unknown }));
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => sessao.usuario,
}));

import { GET as rotaOriginalDeExemplo } from "@/app/api/painel/originais/[eventoId]/[fotoId]/route";
import { GET as rotaSemMarca } from "@/app/api/painel/sem-marca/[fotoId]/route";
import { buscarUsuario, criarEvento, criarUsuario, type Usuario } from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { gerarHashSenha } from "@/lib/senha";

import { miniaturaSemMarca } from "./miniatura-sem-marca";
import {
  liberarOriginais,
  liberarOriginaisDoAutor,
  liberarVendidasDoAutor,
  loteDeOriginais,
  loteDeVendidasDoAutor,
  originalIndividual,
} from "./originais-do-dono";

// Complemento dos testes da exceção do autor (original-individual, originais-do-dono,
// miniatura-sem-marca, vendidas-do-autor): troca de fotoId para a foto de OUTRO autor no mesmo
// evento colaborativo, nas rotas que ainda não tinham esse caso (miniatura sem marca e original de
// exemplo do lote), no lote "minhas" e na aba Fotos vendidas com ids de outro autor.

const [lia, pedro] = fotografos;
/** Original de exemplo (fora da produção as rotas leem a URL); o fetch é simulado. */
const ORIGINAL = "https://exemplo.test/original-idor.jpg";

async function usuarioNovo(papel: "cliente" | "admin" | "fotografo") {
  return criarUsuario({
    nome: `Pessoa ${papel}`,
    email: `${randomUUID()}@teste.com`,
    senhaHash: gerarHashSenha("senha-de-teste-123"),
    papel,
    emailConfirmado: true,
  });
}

let ordem = 0;
async function novaFoto(
  eventoId: string,
  enviadaPor: string,
  extra: Partial<typeof t.fotos.$inferInsert> = {},
) {
  const banco = await obterBanco();
  const id = randomUUID();
  await banco.insert(t.fotos).values({
    id,
    eventoId,
    enviadaPor,
    chaveOriginal: ORIGINAL,
    urlPrevia: `previas/${id}.webp`,
    urlMiniatura: `miniaturas/${id}.webp`,
    nomeArquivo: `Foto ${++ordem}.JPG`,
    largura: 1200,
    altura: 800,
    tamanhoBytes: 500_000,
    ordem,
    status: "pronta",
    ...extra,
  });
  return id;
}

/** Marca a foto como vendida num pedido pago. */
async function vender(fotoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [pedido] = await banco
    .insert(t.pedidos)
    .values({
      emailComprador: `${randomUUID()}@teste.com`,
      nomeComprador: "Comprador",
      subtotalCentavos: 1500,
      descontoCentavos: 0,
      totalCentavos: 1500,
      metodo: "pix",
      status: "pago",
      expiraEm: new Date(Date.now() + 3_600_000),
    })
    .returning();
  await banco.insert(t.itensPedido).values({
    pedidoId: pedido.id,
    fotoId,
    fotografoId,
    precoCentavos: 1500,
    descontoCentavos: 0,
    valorFotografoCentavos: 1500,
    valorDonoEventoCentavos: 0,
  });
}

function chamarSemMarca(fotoId: string) {
  return rotaSemMarca(new NextRequest(`http://localhost/api/painel/sem-marca/${fotoId}`), {
    params: Promise.resolve({ fotoId }),
  } as RouteContext<"/api/painel/sem-marca/[fotoId]">);
}

function chamarExemplo(eventoId: string, fotoId: string, modo: string, liberacao: string) {
  const url = new URL(`http://localhost/api/painel/originais/${eventoId}/${fotoId}`);
  url.searchParams.set("modo", modo);
  url.searchParams.set("liberacao", liberacao);
  return rotaOriginalDeExemplo(new NextRequest(url), {
    params: Promise.resolve({ eventoId, fotoId }),
  } as RouteContext<"/api/painel/originais/[eventoId]/[fotoId]">);
}

let usuarioLia: Usuario;
let usuarioPedro: Usuario;
let evento: Awaited<ReturnType<typeof criarEvento>>;
const f: Record<string, string> = {};

beforeAll(async () => {
  usuarioLia = (await buscarUsuario(lia.usuarioId))!;
  usuarioPedro = (await buscarUsuario(pedro.usuarioId))!;
  evento = await criarEvento(lia.id, {
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
    titulo: "Evento colaborativo do IDOR",
    slug: `idor-autor-${randomUUID().slice(0, 8)}`,
  });
  const banco = await obterBanco();
  // Pedro colabora no evento da Lia (convite aceito).
  await banco.insert(t.colaboradores).values({
    eventoId: evento.id,
    fotografoId: pedro.id,
    comissaoDonoPct: 20,
    aceitoEm: new Date(),
  });
  f.lia = await novaFoto(evento.id, lia.id);
  f.pedro = await novaFoto(evento.id, pedro.id);
  await vender(f.lia, lia.id);
  await vender(f.pedro, pedro.id);
});

beforeEach(async () => {
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === ORIGINAL
        ? new Response(new Uint8Array(original), { headers: { "Content-Type": "image/jpeg" } })
        : new Response(null, { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessao.usuario = null;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("miniatura sem marca: só o autor, mesmo no evento colaborativo", () => {
  it("o dono do evento não recebe a foto do colaborador, nem o colaborador a do dono", async () => {
    const negado = { ok: false, motivo: "nao_encontrado" };
    expect((await miniaturaSemMarca(usuarioLia, f.lia)).ok).toBe(true);
    expect((await miniaturaSemMarca(usuarioPedro, f.pedro)).ok).toBe(true);
    expect(await miniaturaSemMarca(usuarioLia, f.pedro)).toEqual(negado);
    expect(await miniaturaSemMarca(usuarioPedro, f.lia)).toEqual(negado);
  });

  it("gestor (com a própria conta de fotógrafo criada no acesso) não recebe a foto de ninguém", async () => {
    const gestor = await usuarioNovo("admin");
    for (const foto of [f.lia, f.pedro]) {
      expect(await miniaturaSemMarca(gestor, foto)).toEqual({
        ok: false,
        motivo: "nao_encontrado",
      });
    }
  });

  it("pela rota: trocar o fotoId para a foto de outro autor dá 404 sem imagem", async () => {
    sessao.usuario = usuarioLia;
    expect((await chamarSemMarca(f.lia)).status).toBe(200);
    const trocada = await chamarSemMarca(f.pedro);
    expect(trocada.status).toBe(404);
    expect(trocada.headers.get("content-type")).toBeNull();
    expect((await trocada.arrayBuffer()).byteLength).toBe(0);
  });
});

describe("original individual: trocar o fotoId", () => {
  it("com a liberação válida do próprio evento, a foto do outro autor não sai", async () => {
    const daLia = await liberarOriginaisDoAutor(usuarioLia, evento.id, undefined);
    const doPedro = await liberarOriginaisDoAutor(usuarioPedro, evento.id, undefined);
    if (!daLia.ok || !doPedro.ok) throw new Error("liberação");
    expect(
      await originalIndividual(usuarioLia, { fotoId: f.pedro, liberacao: daLia.liberacao }, null),
    ).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(
      await originalIndividual(usuarioPedro, { fotoId: f.lia, liberacao: doPedro.liberacao }, null),
    ).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("original de exemplo (URL externa) não sai na produção, nem para o autor", async () => {
    const daLia = await liberarOriginaisDoAutor(usuarioLia, evento.id, undefined);
    if (!daLia.ok) throw new Error("liberação");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(
      await originalIndividual(usuarioLia, { fotoId: f.lia, liberacao: daLia.liberacao }, null),
    ).toEqual({ ok: false, motivo: "indisponivel" });
  });
});

describe("lotes: ids de outro autor não voltam", () => {
  it("lote 'minhas' e 'vendidas' do dono com o id da foto do colaborador: vazio", async () => {
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error("liberação");
    for (const modo of ["minhas", "vendidas"] as const) {
      const lote = await loteDeOriginais(
        usuarioLia,
        { eventoId: evento.id, modo, liberacao: liberado.liberacao, ids: [f.pedro] },
        null,
      );
      expect(lote, modo).toMatchObject({ ok: true, itens: [] });
      // Sem ids: só a foto da própria Lia.
      const tudo = await loteDeOriginais(
        usuarioLia,
        { eventoId: evento.id, modo, liberacao: liberado.liberacao },
        null,
      );
      if (!tudo.ok) throw new Error(tudo.erro);
      expect(tudo.itens.map((i) => i.id)).toEqual([f.lia]);
    }
  });

  it("aba Fotos vendidas: o colaborador pedindo a foto vendida do dono não recebe nada", async () => {
    const liberado = await liberarVendidasDoAutor(usuarioPedro, undefined);
    if (!liberado.ok) throw new Error("liberação");
    const lote = await loteDeVendidasDoAutor(
      usuarioPedro,
      { liberacao: liberado.liberacao, ids: [f.lia, f.pedro] },
      null,
    );
    if (!lote.ok) throw new Error(lote.erro);
    expect(lote.itens.map((i) => i.id)).toEqual([f.pedro]);
  });
});

describe("rota /api/painel/originais/[eventoId]/[fotoId] (exemplo, fora da produção)", () => {
  it("o dono baixa a própria; a do colaborador, de outro evento ou com outro modo, 404", async () => {
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error("liberação");
    sessao.usuario = usuarioLia;
    const propria = await chamarExemplo(evento.id, f.lia, "minhas", liberado.liberacao);
    expect(propria.status).toBe(200);
    expect(propria.headers.get("content-disposition")).toMatch(/^attachment;/);

    expect((await chamarExemplo(evento.id, f.pedro, "minhas", liberado.liberacao)).status).toBe(
      404,
    );
    expect((await chamarExemplo(evento.id, f.pedro, "vendidas", liberado.liberacao)).status).toBe(
      404,
    );
    expect((await chamarExemplo(randomUUID(), f.lia, "minhas", liberado.liberacao)).status).toBe(
      404,
    );
    expect((await chamarExemplo(evento.id, f.lia, "individual", liberado.liberacao)).status).toBe(
      404,
    );
  });

  it("o colaborador, com a liberação do dono ou com a dele, não baixa nada pelo lote", async () => {
    const daLia = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!daLia.ok) throw new Error("liberação");
    sessao.usuario = usuarioPedro;
    for (const foto of [f.lia, f.pedro]) {
      expect((await chamarExemplo(evento.id, foto, "minhas", daLia.liberacao)).status).toBe(404);
    }
  });

  it("cliente, visitante e produção: 404", async () => {
    const liberado = await liberarOriginais(usuarioLia, evento.id, undefined);
    if (!liberado.ok) throw new Error("liberação");
    sessao.usuario = await usuarioNovo("cliente");
    expect((await chamarExemplo(evento.id, f.lia, "minhas", liberado.liberacao)).status).toBe(404);
    sessao.usuario = null;
    expect((await chamarExemplo(evento.id, f.lia, "minhas", liberado.liberacao)).status).toBe(404);
    sessao.usuario = usuarioLia;
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await chamarExemplo(evento.id, f.lia, "minhas", liberado.liberacao)).status).toBe(404);
  });
});
