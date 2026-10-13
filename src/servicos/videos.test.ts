import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
// O bucket público não existe nos testes: guarda o que seria gravado.
const gravados = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/r2", async (original) => ({
  ...(await original<typeof import("@/lib/r2")>()),
  gravarPublico: async (chave: string, conteudo: Buffer) => {
    gravados.set(chave, conteudo.length);
  },
  removerOriginal: async () => {},
}));

import { criarContaDeFotografoSeNaoExistir, criarEvento, criarUsuario } from "@/dados";
import { categorias } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { copiarParaStream, situacaoNoStream } from "@/lib/stream";
import { detectarVideo, MENSAGEM_VIDEO_LONGO } from "@/lib/tipos-video";

import { atualizarVideosNoStream } from "./videos";

// Vídeos de até 30 segundos: o Stream prepara a prévia com marca d'água; aqui se confere a
// duração, gera a miniatura (com a nossa marca) e o vídeo fica à venda.

function ftyp(marca: string) {
  const b = new Uint8Array(32);
  b.set([0, 0, 0, 24]);
  b.set(new TextEncoder().encode(`ftyp${marca}`), 4);
  return b;
}

describe("formato do vídeo pelo conteúdo", () => {
  it("reconhece MP4 e MOV e recusa o resto", () => {
    expect(detectarVideo(ftyp("isom"))).toBe("mp4");
    expect(detectarVideo(ftyp("mp42"))).toBe("mp4");
    expect(detectarVideo(ftyp("qt  "))).toBe("mov");
    expect(detectarVideo(ftyp("heic"))).toBeNull();
    expect(detectarVideo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });
});

type VideoFalso = { pronto: boolean; duracao: number; estado?: string };
const videos = new Map<string, VideoFalso>();
let corpos: unknown[] = [];

beforeEach(async () => {
  vi.stubEnv("CLOUDFLARE_STREAM_TOKEN", "token-teste");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "conta-teste");
  vi.stubEnv("CLOUDFLARE_STREAM_MARCA", "marca-123");
  vi.spyOn(console, "error").mockImplementation(() => {});
  gravados.clear();
  corpos = [];
  const quadro = await sharp({
    create: { width: 1920, height: 1080, channels: 3, background: { r: 20, g: 80, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/thumbnails/")) return new Response(new Uint8Array(quadro));
      if (url.endsWith("/stream/copy")) {
        corpos.push(JSON.parse(String(init.body)));
        return Response.json({ success: true, result: { uid: "uid-novo" } });
      }
      const uid = decodeURIComponent(url.split("/stream/")[1] ?? "");
      if (init.method === "DELETE") {
        videos.delete(uid);
        return Response.json({ success: true, result: null });
      }
      const v = videos.get(uid);
      if (!v)
        return Response.json(
          { success: false, errors: [{ message: "não achou" }] },
          { status: 404 },
        );
      return Response.json({
        success: true,
        result: {
          readyToStream: v.pronto,
          status: { state: v.estado ?? (v.pronto ? "ready" : "inprogress") },
          duration: v.pronto ? v.duracao : -1,
          input: { width: 1920, height: 1080 },
        },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Cloudflare Stream", () => {
  it("pede a cópia com o perfil de marca d'água e lê a situação do vídeo", async () => {
    expect(await copiarParaStream("https://r2/assinada", "nome", "foto-1")).toBe("uid-novo");
    expect(corpos[0]).toMatchObject({
      url: "https://r2/assinada",
      watermark: { uid: "marca-123" },
    });
    videos.set("v1", { pronto: false, duracao: 0 });
    expect(await situacaoNoStream("v1")).toEqual({ estado: "processando" });
    videos.set("v2", { pronto: true, duracao: 12.4 });
    expect(await situacaoNoStream("v2")).toEqual({
      estado: "pronto",
      duracaoS: 12.4,
      largura: 1920,
      altura: 1080,
    });
  });
});

async function videoNoStream(uid: string) {
  const usuario = await criarUsuario({
    nome: "Fotógrafo Vídeo",
    email: `${randomUUID().slice(0, 8)}@video.com`,
    senhaHash: "x",
    papel: "fotografo",
    emailConfirmado: true,
  });
  const conta = await criarContaDeFotografoSeNaoExistir({
    usuarioId: usuario.id,
    nomePublico: "Fotógrafo Vídeo",
    slug: `video-${randomUUID().slice(0, 8)}`,
  });
  const evento = await criarEvento(conta!.id, {
    categoriaId: categorias[0].id,
    inicioEm: "2026-11-01T08:00:00-03:00",
    fimEm: "2026-11-01T12:00:00-03:00",
    local: "Arena",
    cidade: "Miguel Calmon",
    estado: "BA",
    precoFotoCentavos: 1000,
    precoVideoCentavos: 2500,
    visibilidade: "publico",
    listado: true,
    liberacao: "automatica",
    liberadoEm: null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: "envio",
    titulo: "Montaria em vídeo",
    slug: `montaria-video-${randomUUID().slice(0, 8)}`,
  });
  const id = randomUUID();
  const banco = await obterBanco();
  await banco.insert(t.fotos).values({
    id,
    eventoId: evento.id,
    enviadaPor: conta!.id,
    tipo: "video",
    chaveOriginal: `originais/${conta!.id}/${evento.id}/${id}.mp4`,
    urlPrevia: `previas/${id}-v3.webp`,
    urlMiniatura: `miniaturas/${id}-v3.webp`,
    nomeArquivo: "laco.mp4",
    largura: 0,
    altura: 0,
    ordem: 1,
    status: "processando",
    streamUid: uid,
    envioIniciadoEm: new Date(),
  });
  return id;
}

async function situacao(id: string) {
  const banco = await obterBanco();
  const [f] = await banco
    .select({ status: t.fotos.status, erro: t.fotos.erroMensagem, duracao: t.fotos.duracaoS })
    .from(t.fotos)
    .where((await import("drizzle-orm")).eq(t.fotos.id, id));
  return f;
}

describe("vídeo pronto no Stream", () => {
  it("com até 30 segundos: gera miniatura e prévia com a marca e fica à venda", async () => {
    const uid = `ok-${randomUUID()}`;
    videos.set(uid, { pronto: true, duracao: 12.4 });
    const id = await videoNoStream(uid);
    await atualizarVideosNoStream();
    expect(await situacao(id)).toMatchObject({ status: "pronta", duracao: 12 });
    expect(gravados.has(`miniaturas/${id}-v3.webp`)).toBe(true);
    expect(gravados.has(`previas/${id}-v3.webp`)).toBe(true);
  });

  it("ainda convertendo: continua em processamento", async () => {
    const uid = `esperando-${randomUUID()}`;
    videos.set(uid, { pronto: false, duracao: 0 });
    const id = await videoNoStream(uid);
    await atualizarVideosNoStream();
    expect((await situacao(id)).status).toBe("processando");
  });

  it("com mais de 30 segundos: vira erro e sai do Stream", async () => {
    const uid = `longo-${randomUUID()}`;
    videos.set(uid, { pronto: true, duracao: 45 });
    const id = await videoNoStream(uid);
    await atualizarVideosNoStream();
    expect(await situacao(id)).toMatchObject({ status: "erro", erro: MENSAGEM_VIDEO_LONGO });
    expect(videos.has(uid)).toBe(false);
  });
});
