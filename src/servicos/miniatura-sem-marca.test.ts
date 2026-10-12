import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
// A rota lê a sessão; o resto do módulo (contaDoPainel) continua o de verdade.
const sessao = vi.hoisted(() => ({ usuario: null as unknown }));
vi.mock("@/servicos/sessao", async (original) => ({
  ...(await original<typeof import("@/servicos/sessao")>()),
  usuarioAtual: async () => sessao.usuario,
}));

import { GET as rotaSemMarca } from "@/app/api/painel/sem-marca/[fotoId]/route";
import { criarContaDeFotografoSeNaoExistir, criarEvento, criarUsuario } from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { gerarHashSenha } from "@/lib/senha";

import { LADO_SEM_MARCA, miniaturaSemMarca } from "./miniatura-sem-marca";

// Miniatura sem marca d'água (Meus clientes): só o autor da foto, conferido no servidor.

/** Original de exemplo (fora da produção, a rota lê a URL); aqui o fetch é simulado. */
const ORIGINAL = "https://exemplo.test/original.jpg";

async function usuarioNovo(papel: "cliente" | "fotografo") {
  return criarUsuario({
    nome: `Pessoa ${papel}`,
    email: `${randomUUID()}@teste.com`,
    senhaHash: gerarHashSenha("senha-de-teste-123"),
    papel,
    emailConfirmado: true,
  });
}

async function fotografoNovo(nome: string) {
  const usuario = await usuarioNovo("fotografo");
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: nome,
    slug: `${nome.toLowerCase().replace(/\W+/g, "-")}-${randomUUID().slice(0, 8)}`,
  });
  return { usuario, conta: conta! };
}

async function novoEvento(fotografoId: string) {
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
    titulo: "Evento sem marca",
    slug: `sem-marca-${randomUUID().slice(0, 8)}`,
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
    nomeArquivo: `Largada ${String(++ordem).padStart(3, "0")}.JPG`,
    largura: 1200,
    altura: 800,
    tamanhoBytes: 500_000,
    ordem,
    status: "pronta",
    ...extra,
  });
  return id;
}

function chamarRota(fotoId: string) {
  return rotaSemMarca(new NextRequest(`http://localhost/api/painel/sem-marca/${fotoId}`), {
    params: Promise.resolve({ fotoId }),
  } as RouteContext<"/api/painel/sem-marca/[fotoId]">);
}

beforeEach(async () => {
  // Um JPEG 1200×800 de uma cor só faz o papel do original.
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 30, b: 30 } },
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

describe("miniatura sem marca d'água (Meus clientes)", () => {
  it("o autor recebe a foto sem marca, reduzida a 400 px no lado menor", async () => {
    const { usuario, conta } = await fotografoNovo("Lia Sem Marca");
    const evento = await novoEvento(conta.id);
    const fotoId = await novaFoto(evento.id, conta.id);

    const resultado = await miniaturaSemMarca(usuario, fotoId);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const meta = await sharp(resultado.imagem).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.height).toBe(LADO_SEM_MARCA);
    expect(meta.width).toBe(600);
  });

  it("outro fotógrafo, cliente e visitante não recebem, nem sabem se a foto existe", async () => {
    const autor = await fotografoNovo("Autor Sem Marca");
    const outro = await fotografoNovo("Outro Sem Marca");
    const cliente = await usuarioNovo("cliente");
    const evento = await novoEvento(autor.conta.id);
    const fotoId = await novaFoto(evento.id, autor.conta.id);

    const negado = { ok: false, motivo: "nao_encontrado" };
    for (const usuario of [outro.usuario, cliente, null]) {
      expect(await miniaturaSemMarca(usuario, fotoId)).toEqual(negado);
    }
    expect(await miniaturaSemMarca(autor.usuario, "nao-e-um-id")).toEqual(negado);
    expect(await miniaturaSemMarca(autor.usuario, randomUUID())).toEqual(negado);
  });

  it("foto ainda chegando não sai; original fora do alcance fica indisponível", async () => {
    const { usuario, conta } = await fotografoNovo("Lia Envio Sem Marca");
    const evento = await novoEvento(conta.id);
    const chegando = await novaFoto(evento.id, conta.id, { status: "processando" });
    expect(await miniaturaSemMarca(usuario, chegando)).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });

    // Original no R2, com o R2 sem configurar.
    vi.stubEnv("R2_ACCOUNT_ID", "");
    const noR2 = await novaFoto(evento.id, conta.id, {
      chaveOriginal: `originais/${conta.id}/${evento.id}/${randomUUID()}.jpg`,
    });
    expect(await miniaturaSemMarca(usuario, noR2)).toEqual({ ok: false, motivo: "indisponivel" });

    // O exemplo que não abre (404) também.
    const quebrada = await novaFoto(evento.id, conta.id, {
      chaveOriginal: "https://exemplo.test/sumiu.jpg",
    });
    expect(await miniaturaSemMarca(usuario, quebrada)).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });

  it("a rota entrega WebP com cache só do navegador, e 404 para quem não é o autor", async () => {
    const autor = await fotografoNovo("Rota Sem Marca");
    const outro = await fotografoNovo("Rota Outro Sem Marca");
    const evento = await novoEvento(autor.conta.id);
    const fotoId = await novaFoto(evento.id, autor.conta.id);

    sessao.usuario = autor.usuario;
    const resposta = await chamarRota(fotoId);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("image/webp");
    expect(resposta.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    expect((await resposta.arrayBuffer()).byteLength).toBeGreaterThan(0);

    sessao.usuario = outro.usuario;
    const negada = await chamarRota(fotoId);
    expect(negada.status).toBe(404);
    expect(negada.headers.get("cache-control")).toBe("no-store");

    sessao.usuario = null;
    expect((await chamarRota(fotoId)).status).toBe(404);
  });
});
