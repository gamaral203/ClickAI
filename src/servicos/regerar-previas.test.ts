import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import { GET as regerarRota } from "@/app/api/jobs/regerar-previas/route";
import { contarFotosComPreviaAntiga, criarEvento } from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { SUFIXO_DA_VERSAO, VERSAO_DA_MARCA, versaoDaChave } from "@/lib/marca-dagua";
import { reiniciarClienteR2 } from "@/lib/r2";

import { chavesDaFoto } from "./envios";
import { gerarVersoes, LARGURA_MINIATURA, LARGURA_PREVIA } from "./imagens";
import { regerarPrevias } from "./regerar-previas";

const [lia] = fotografos;

const R2 = {
  R2_ACCOUNT_ID: "conta-teste",
  R2_ACCESS_KEY_ID: "chave-teste",
  R2_SECRET_ACCESS_KEY: "segredo-teste",
  R2_BUCKET_ORIGINAIS: "fotos-originais",
  R2_BUCKET_PUBLICO: "fotos-publicas",
  R2_URL_PUBLICA: "https://pub-teste.r2.dev",
};

// ---------------------------------------------------------------- S3 falso, em memória

const objetos = new Map<string, Buffer>();
const nome = (bucket?: string, chave?: string) => `${bucket}/${chave}`;
/** Toda gravação no bucket público (para conferir que nenhum original vai para lá). */
const gravacoesPublicas: { chave: string; corpo: Buffer }[] = [];

beforeAll(() => {
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (comando: unknown) => {
    if (comando instanceof PutObjectCommand) {
      const { Bucket, Key, Body } = comando.input;
      const corpo = Buffer.from(Body as Buffer);
      objetos.set(nome(Bucket, Key), corpo);
      if (Bucket === R2.R2_BUCKET_PUBLICO) gravacoesPublicas.push({ chave: Key!, corpo });
      return {};
    }
    if (comando instanceof GetObjectCommand) {
      const objeto = objetos.get(nome(comando.input.Bucket, comando.input.Key));
      if (!objeto) {
        throw Object.assign(new Error("NoSuchKey"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 404 },
        });
      }
      return {
        ContentLength: objeto.length,
        Body: { transformToByteArray: async () => new Uint8Array(objeto) },
      };
    }
    if (comando instanceof DeleteObjectCommand) {
      objetos.delete(nome(comando.input.Bucket, comando.input.Key));
      return {};
    }
    throw new Error("Comando inesperado no S3 falso");
  }) as never);
});

beforeEach(() => {
  for (const [chave, valor] of Object.entries(R2)) vi.stubEnv(chave, valor);
  reiniciarClienteR2();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------- Ajudantes

/** Foto "de verdade": gradiente com formas, para a marca ter o que cobrir. */
async function fotoDeTeste(largura: number, altura: number) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#3a6"/><stop offset="1" stop-color="#a53"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<circle cx="${largura / 2}" cy="${altura / 2}" r="${altura / 4}" fill="#246"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

let ordem = 0;
async function eventoComFotosAntigas(quantas: number) {
  const evento = await criarEvento(lia.id, {
    categoriaId: categorias[0].id,
    titulo: "Evento ao vivo",
    slug: `ao-vivo-${randomUUID().slice(0, 8)}`,
    inicioEm: "2026-10-11T08:00:00-03:00",
    fimEm: null,
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
  });
  const banco = await obterBanco();
  const fotos = [];
  for (let i = 0; i < quantas; i++) {
    const id = randomUUID();
    const caminho = `${lia.id}/${evento.id}/${id}`;
    const original = await fotoDeTeste(3000, 2000);
    const antiga = {
      // Chaves da versão 1 da marca (sem sufixo), como as fotos enviadas antes desta mudança.
      urlPrevia: `previas/${caminho}.webp`,
      urlMiniatura: `miniaturas/${caminho}.webp`,
    };
    objetos.set(nome(R2.R2_BUCKET_ORIGINAIS, `originais/${caminho}.jpg`), original);
    objetos.set(nome(R2.R2_BUCKET_PUBLICO, antiga.urlPrevia), Buffer.from("previa-antiga"));
    objetos.set(nome(R2.R2_BUCKET_PUBLICO, antiga.urlMiniatura), Buffer.from("miniatura-antiga"));
    await banco.insert(t.fotos).values({
      id,
      eventoId: evento.id,
      enviadaPor: lia.id,
      chaveOriginal: `originais/${caminho}.jpg`,
      ...antiga,
      nomeArquivo: `IMG_${++ordem}.JPG`,
      largura: 3000,
      altura: 2000,
      tamanhoBytes: original.length,
      ordem,
      status: "pronta",
    });
    fotos.push({ id, original, antiga });
  }
  return { evento, fotos };
}

async function fotoNoBanco(id: string) {
  const banco = await obterBanco();
  const [foto] = await banco.select().from(t.fotos).where(eq(t.fotos.id, id));
  return foto;
}

// ---------------------------------------------------------------- Prévia e marca

describe("prévia com marca d'água", () => {
  it("a prévia tem no máximo LARGURA_PREVIA no lado maior (deitada e em pé)", async () => {
    expect(LARGURA_PREVIA).toBe(1600);
    expect(LARGURA_MINIATURA).toBe(400);
    for (const [w, h] of [
      [6000, 4000],
      [4000, 6000],
      [5000, 5000],
    ]) {
      const { previa, miniatura } = await gerarVersoes(await fotoDeTeste(w, h), "padrao");
      expect(Math.max(previa.largura, previa.altura)).toBe(LARGURA_PREVIA);
      expect(Math.max(miniatura.largura, miniatura.altura)).toBe(LARGURA_MINIATURA);
      const meta = await sharp(previa.buffer).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(LARGURA_PREVIA);
      // Pixels crus: nada de EXIF (GPS, câmera) na versão pública.
      expect(meta.exif).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------- Regeração das antigas

describe("regeração das prévias antigas", () => {
  it("regera em lotes com a chave nova, troca no banco, apaga as antigas e é idempotente", async () => {
    const { evento, fotos } = await eventoComFotosAntigas(5);
    expect(await contarFotosComPreviaAntiga(evento.id)).toBe(5);

    // Primeiro lote: 3 fotos.
    const lote1 = await regerarPrevias({ eventoId: evento.id, limite: 3, prazoMs: 60_000 });
    expect(lote1).toEqual({ regeradas: 3, falhas: 0, restantes: 2 });
    // Segundo lote: as 2 que faltam.
    const lote2 = await regerarPrevias({ eventoId: evento.id, limite: 3, prazoMs: 60_000 });
    expect(lote2).toEqual({ regeradas: 2, falhas: 0, restantes: 0 });
    // De novo: nada a fazer.
    expect(await regerarPrevias({ eventoId: evento.id, prazoMs: 60_000 })).toEqual({
      regeradas: 0,
      falhas: 0,
      restantes: 0,
    });

    for (const foto of fotos) {
      const linha = await fotoNoBanco(foto.id);
      const novas = chavesDaFoto(lia.id, evento.id, foto.id);
      expect(linha.urlPrevia).toBe(novas.previa);
      expect(linha.urlMiniatura).toBe(novas.miniatura);
      expect(linha.urlPrevia.endsWith(SUFIXO_DA_VERSAO)).toBe(true);
      expect(versaoDaChave(linha.urlPrevia)).toBe(VERSAO_DA_MARCA);
      expect(versaoDaChave(foto.antiga.urlPrevia)).toBe(1);
      // A prévia nova existe e é pequena; a antiga saiu do bucket.
      const nova = objetos.get(nome(R2.R2_BUCKET_PUBLICO, novas.previa))!;
      const meta = await sharp(nova).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(LARGURA_PREVIA);
      expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, novas.miniatura))).toBe(true);
      expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, foto.antiga.urlPrevia))).toBe(false);
      expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, foto.antiga.urlMiniatura))).toBe(false);
      // O original continua no bucket privado (quem comprou ainda baixa).
      expect(objetos.has(nome(R2.R2_BUCKET_ORIGINAIS, linha.chaveOriginal!))).toBe(true);
    }
  });

  it("nenhum original vai para o bucket público", async () => {
    gravacoesPublicas.length = 0;
    const { evento, fotos } = await eventoComFotosAntigas(2);
    await regerarPrevias({ eventoId: evento.id, prazoMs: 60_000 });
    expect(gravacoesPublicas.length).toBe(4);
    for (const { chave, corpo } of gravacoesPublicas) {
      expect(chave).toMatch(/^(previas|miniaturas)\/.+-v3\.webp$/);
      expect((await sharp(corpo).metadata()).format).toBe("webp");
      for (const foto of fotos) expect(corpo.equals(foto.original)).toBe(false);
      const meta = await sharp(corpo).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(LARGURA_PREVIA);
    }
  });

  it("foto sem original no R2 conta como falha e fica com a prévia antiga", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { evento, fotos } = await eventoComFotosAntigas(1);
    const [foto] = fotos;
    objetos.delete(nome(R2.R2_BUCKET_ORIGINAIS, (await fotoNoBanco(foto.id)).chaveOriginal!));
    expect(await regerarPrevias({ eventoId: evento.id, prazoMs: 60_000 })).toEqual({
      regeradas: 0,
      falhas: 1,
      restantes: 1,
    });
    expect((await fotoNoBanco(foto.id)).urlPrevia).toBe(foto.antiga.urlPrevia);
    expect(objetos.has(nome(R2.R2_BUCKET_PUBLICO, foto.antiga.urlPrevia))).toBe(true);
  });

  it("a rota exige o CRON_SECRET e aceita o evento pelo endereço", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    const { evento } = await eventoComFotosAntigas(1);
    const url = `http://localhost/api/jobs/regerar-previas?evento=${evento.slug}`;
    const { NextRequest } = await import("next/server");

    const semAutorizacao = await regerarRota(new NextRequest(url));
    expect(semAutorizacao.status).toBe(401);

    const autorizacao = { authorization: "Bearer segredo-do-cron" };
    const inexistente = await regerarRota(
      new NextRequest("http://localhost/api/jobs/regerar-previas?evento=nao-existe", {
        headers: autorizacao,
      }),
    );
    expect(inexistente.status).toBe(404);
    const invalido = await regerarRota(
      new NextRequest("http://localhost/api/jobs/regerar-previas?limite=0", {
        headers: autorizacao,
      }),
    );
    expect(invalido.status).toBe(400);

    const ok = await regerarRota(new NextRequest(url, { headers: autorizacao }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ regeradas: 1, falhas: 0, restantes: 0 });
  });
});

describe("job de revisão", () => {
  it("continua a regeração com o tempo que sobra", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    const { evento, fotos } = await eventoComFotosAntigas(2);
    const { rodarJobDeRevisao } = await import("./jobs");
    const resultado = await rodarJobDeRevisao();
    expect(resultado.previas?.regeradas).toBeGreaterThanOrEqual(2);
    expect(await contarFotosComPreviaAntiga(evento.id)).toBe(0);
    for (const foto of fotos) {
      expect((await fotoNoBanco(foto.id)).urlPrevia.endsWith(SUFIXO_DA_VERSAO)).toBe(true);
    }
  });
});
