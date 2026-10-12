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
import { SUFIXO_DA_VERSAO, versaoDaChave } from "@/lib/marca-dagua";
import { reiniciarClienteR2 } from "@/lib/r2";

import { chavesDaFoto } from "./envios";
import {
  gerarPrevia,
  gerarVersoes,
  LARGURA_MINIATURA,
  LARGURA_PREVIA,
  QUALIDADE_PREVIA,
} from "./imagens";
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

/** Pixels de uma região (fração da imagem), em tons de cinza. */
async function regiao(imagem: Buffer, x: number, y: number, w: number, h: number) {
  const { width, height } = await sharp(imagem).metadata();
  const { data } = await sharp(imagem)
    .extract({
      left: Math.round(width! * x),
      top: Math.round(height! * y),
      width: Math.round(width! * w),
      height: Math.round(height! * h),
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function estatisticas(pixels: Buffer) {
  let soma = 0;
  for (const p of pixels) soma += p;
  const media = soma / pixels.length;
  let variancia = 0;
  for (const p of pixels) variancia += (p - media) ** 2;
  return { media, variancia: variancia / pixels.length };
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

describe("prévia contra remoção por IA", () => {
  it("a prévia tem no máximo LARGURA_PREVIA no lado maior (deitada e em pé)", async () => {
    expect(LARGURA_PREVIA).toBe(800);
    expect(LARGURA_MINIATURA).toBe(400);
    expect(QUALIDADE_PREVIA).toBeLessThanOrEqual(55);
    for (const [w, h] of [
      [6000, 4000],
      [4000, 6000],
      [5000, 5000],
    ]) {
      const { previa, miniatura } = await gerarVersoes(await fotoDeTeste(w, h), "padrao", "x");
      expect(Math.max(previa.largura, previa.altura)).toBe(LARGURA_PREVIA);
      expect(Math.max(miniatura.largura, miniatura.altura)).toBe(LARGURA_MINIATURA);
      const meta = await sharp(previa.buffer).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(LARGURA_PREVIA);
      // Pixels crus: nada de EXIF (GPS, câmera) na versão pública.
      expect(meta.exif).toBeUndefined();
    }
  });

  it("a marca cobre o centro da foto, onde fica quem foi fotografado", async () => {
    // Foto lisa: sem marca, a região central seria uniforme (variância ~0).
    const lisa = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 110, b: 130 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const previa = await gerarPrevia(lisa, "padrao", "foto-lisa");
    const centro = estatisticas(await regiao(previa.buffer, 0.35, 0.35, 0.3, 0.3));
    expect(centro.variancia).toBeGreaterThan(150);

    // Foto com conteúdo: o centro da prévia difere bastante da mesma foto reduzida sem marca.
    const foto = await fotoDeTeste(3000, 2000);
    const comMarca = (await gerarPrevia(foto, "padrao", "foto-1")).buffer;
    const semMarca = await sharp(foto).resize(LARGURA_PREVIA).webp({ quality: 95 }).toBuffer();
    const [a, b] = await Promise.all([
      regiao(comMarca, 0.3, 0.3, 0.4, 0.4),
      regiao(semMarca, 0.3, 0.3, 0.4, 0.4),
    ]);
    let alterados = 0;
    let diferenca = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      diferenca += d;
      if (d > 12) alterados++;
    }
    // Uma boa parte do centro foi coberta (logo grande, texto e linhas)...
    expect(alterados / a.length).toBeGreaterThan(0.2);
    expect(diferenca / a.length).toBeGreaterThan(8);
    // ...e no centro há mais marca do que num canto (a logo grande fica no meio).
    const canto = estatisticas(await regiao(previa.buffer, 0, 0, 0.15, 0.15));
    expect(centro.variancia).toBeGreaterThan(canto.variancia * 0.8);
  });

  it("o padrão muda de foto para foto (semente pelo id), sem custo de redesenhar", async () => {
    const foto = await fotoDeTeste(3000, 2000);
    const [a, b, a2] = await Promise.all([
      gerarPrevia(foto, "padrao", "foto-a"),
      gerarPrevia(foto, "padrao", "foto-b"),
      gerarPrevia(foto, "padrao", "foto-a"),
    ]);
    expect(a.buffer.equals(b.buffer)).toBe(false);
    // A mesma foto gera a mesma prévia (a regeração é reprodutível).
    expect(a.buffer.equals(a2.buffer)).toBe(true);
    // Numa foto lisa, a diferença é só a marca: ela muda em boa parte da imagem (grade,
    // linhas, faixas e a marca principal), não só num detalhe.
    const lisa = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 110, b: 130 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const [x, y] = await Promise.all([
      gerarPrevia(lisa, "padrao", "foto-x"),
      gerarPrevia(lisa, "padrao", "foto-y"),
    ]);
    const [px, py] = await Promise.all([
      regiao(x.buffer, 0, 0, 1, 1),
      regiao(y.buffer, 0, 0, 1, 1),
    ]);
    let diferentes = 0;
    for (let i = 0; i < px.length; i++) if (Math.abs(px[i] - py[i]) > 10) diferentes++;
    expect(diferentes / px.length).toBeGreaterThan(0.15);
  });

  it("com a posição dos rostos, a marca principal vai sobre o maior rosto", async () => {
    const lisa = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 110, b: 130 } },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    // Rosto no canto superior esquerdo, longe do centro onde a marca fica sem rostos.
    const rosto = { esquerda: 0.06, topo: 0.06, largura: 0.12, altura: 0.18 };
    const [semRosto, comRosto] = await Promise.all([
      gerarPrevia(lisa, "padrao", "foto-r"),
      gerarPrevia(lisa, "padrao", "foto-r", [rosto]),
    ]);
    // A marca principal é clara (65–75%); a grade e as linhas, bem mais fracas. Pixels muito
    // claros na região do rosto = a marca principal está ali.
    const claros = (p: Buffer) => p.filter((v) => v > 185).length / p.length;
    const noRosto = (b: Buffer) => regiao(b, 0.04, 0.08, 0.2, 0.2);
    expect(claros(await noRosto(comRosto.buffer))).toBeGreaterThan(0.1);
    expect(claros(await noRosto(comRosto.buffer))).toBeGreaterThan(
      claros(await noRosto(semRosto.buffer)) * 3,
    );
    // Sem rostos, a marca principal fica no centro, um pouco acima do meio.
    const noCentro = (b: Buffer) => regiao(b, 0.3, 0.35, 0.4, 0.15);
    expect(claros(await noCentro(semRosto.buffer))).toBeGreaterThan(0.1);
    // Um segundo rosto grande, do outro lado, ganha uma marca menor.
    const outro = { esquerda: 0.8, topo: 0.55, largura: 0.1, altura: 0.15 };
    const doisRostos = await gerarPrevia(lisa, "padrao", "foto-r", [rosto, outro]);
    const noOutro = (b: Buffer) => regiao(b, 0.74, 0.58, 0.22, 0.14);
    expect(claros(await noOutro(doisRostos.buffer))).toBeGreaterThan(
      claros(await noOutro(comRosto.buffer)) * 2,
    );
  });

  it("a miniatura leva a mesma marca, proporcional", async () => {
    const foto = await fotoDeTeste(3000, 2000);
    const [daFoto, deOutra] = await Promise.all([
      gerarVersoes(foto, "padrao", "foto-m"),
      gerarVersoes(foto, "padrao", "outra-foto"),
    ]);
    const { previa, miniatura } = daFoto;
    expect(Math.max(miniatura.largura, miniatura.altura)).toBe(LARGURA_MINIATURA);
    const cinza = (b: Buffer) => sharp(b).greyscale().raw().toBuffer();
    const reduzida = await sharp(previa.buffer)
      .resize(miniatura.largura, miniatura.altura, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    const diferenca = (a: Buffer, b: Buffer) => {
      let soma = 0;
      for (let i = 0; i < a.length; i++) soma += Math.abs(a[i] - b[i]);
      return soma / a.length;
    };
    // Mesmo desenho: a miniatura fica bem mais perto da prévia reduzida da mesma foto do que da
    // miniatura com a marca de outra foto.
    const mesma = diferenca(await cinza(miniatura.buffer), reduzida);
    const outra = diferenca(await cinza(deOutra.miniatura.buffer), reduzida);
    expect(mesma).toBeLessThan(outra * 0.7);
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
      expect(versaoDaChave(linha.urlPrevia)).toBe(2);
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

  it("usa os rostos gravados da foto: a marca vai sobre o maior rosto", async () => {
    const { evento, fotos } = await eventoComFotosAntigas(2);
    const caixa = { esquerda: 0.1, topo: 0.1, largura: 0.12, altura: 0.18 };
    const banco = await obterBanco();
    await banco
      .insert(t.rostos)
      .values({ fotoId: fotos[0].id, rostoIdProvedor: randomUUID(), caixa });
    await regerarPrevias({ eventoId: evento.id, prazoMs: 60_000 });
    const [comRosto, semRosto] = await Promise.all(
      fotos.map(async (f) =>
        objetos.get(nome(R2.R2_BUCKET_PUBLICO, (await fotoNoBanco(f.id)).urlPrevia))!,
      ),
    );
    const esperadas = await Promise.all([
      gerarVersoes(fotos[0].original, "padrao", fotos[0].id, [caixa]),
      gerarVersoes(fotos[1].original, "padrao", fotos[1].id),
    ]);
    expect(comRosto.equals(esperadas[0].previa.buffer)).toBe(true);
    expect(semRosto.equals(esperadas[1].previa.buffer)).toBe(true);
    const semCaixa = await gerarVersoes(fotos[0].original, "padrao", fotos[0].id);
    expect(comRosto.equals(semCaixa.previa.buffer)).toBe(false);
  });

  it("nenhum original vai para o bucket público", async () => {
    gravacoesPublicas.length = 0;
    const { evento, fotos } = await eventoComFotosAntigas(2);
    await regerarPrevias({ eventoId: evento.id, prazoMs: 60_000 });
    expect(gravacoesPublicas.length).toBe(4);
    for (const { chave, corpo } of gravacoesPublicas) {
      expect(chave).toMatch(/^(previas|miniaturas)\/.+-v2\.webp$/);
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
