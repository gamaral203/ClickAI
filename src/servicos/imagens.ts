import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Gera as versões públicas de uma foto (docs/arquitetura.md, "Armazenamento").
// A marca d'água é gravada nos pixels: quem salva a prévia leva a marca junto. Junto com a
// baixa resolução, é a proteção real do original (docs/riscos.md, Segurança).
// Usada no processamento de cada foto enviada (src/servicos/envios.ts) e nos dados de exemplo.
//
// Desempenho (uma foto de 24 MP por vez numa função de 1 vCPU): o original é decodificado uma
// vez só, já reduzido; as versões saem dessa base em pixels crus (sem PNG no meio); e o padrão
// de marcas, igual para todas as fotos do mesmo tamanho, fica em memória entre as fotos.

export const LARGURA_PREVIA = 1600;
export const LARGURA_MINIATURA = 400;
/** Lado maior da cópia que vai ao reconhecimento facial (o Rekognition aceita até 5 MB). */
export const LARGURA_ROSTOS = 1920;

/** Desenho da logo usado como carimbo (vai no bundle das funções por outputFileTracingIncludes). */
const CAMINHO_LOGO = path.join(process.cwd(), "public", "logo.png");

/** Inclinação do padrão de marcas, em graus. */
const INCLINACAO = -24;

export type ImagemGerada = {
  buffer: Buffer;
  largura: number;
  altura: number;
};

/** Guarda uma promessa em cache; se ela falhar, a próxima chamada tenta de novo. */
function lembrar<T>(cache: Map<string, Promise<T>>, chave: string, criar: () => Promise<T>) {
  let valor = cache.get(chave);
  if (!valor) {
    valor = criar();
    valor.catch(() => cache.delete(chave));
    cache.set(chave, valor);
  }
  return valor;
}

const logo = new Map<string, Promise<Buffer>>();
function carregarLogo() {
  return lembrar(logo, CAMINHO_LOGO, () => readFile(CAMINHO_LOGO));
}

/** Silhueta da logo numa cor só, com a transparência original multiplicada pela opacidade. */
async function silhueta(largura: number, cor: "branco" | "preto", opacidade: number) {
  const { data: alfa, info } = await sharp(await carregarLogo())
    .resize({ width: largura })
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < alfa.length; i++) alfa[i] = Math.round(alfa[i] * opacidade);

  const valor = cor === "branco" ? 255 : 0;
  const buffer = await sharp({
    create: {
      width: info.width,
      height: info.height,
      channels: 3,
      background: { r: valor, g: valor, b: valor },
    },
  })
    .joinChannel(alfa, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
  return { buffer, largura: info.width, altura: info.height };
}

/**
 * Um "ladrilho" do padrão: a logo em branco com uma sombra escura deslocada, para a marca
 * aparecer tanto em fotos claras quanto escuras, e um espaço em volta. Um por largura de logo.
 */
const ladrilhos = new Map<string, Promise<Buffer>>();
function ladrilho(larguraLogo: number) {
  return lembrar(ladrilhos, String(larguraLogo), async () => {
    const [clara, sombra] = await Promise.all([
      silhueta(larguraLogo, "branco", 0.42),
      silhueta(larguraLogo, "preto", 0.18),
    ]);
    const deslocamento = Math.max(1, Math.round(larguraLogo / 140));
    const espacoX = Math.round(larguraLogo * 0.55);
    const espacoY = Math.round(clara.altura * 1.6);
    return sharp({
      create: {
        width: clara.largura + espacoX,
        height: clara.altura + espacoY,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: sombra.buffer, left: deslocamento, top: deslocamento },
        { input: clara.buffer, left: 0, top: 0 },
      ])
      .png()
      .toBuffer();
  });
}

type Camada = { pixels: Buffer; largura: number; altura: number };

/**
 * Camadas de marcas já desenhadas, por tamanho de foto. As fotos de um evento quase sempre têm
 * as mesmas medidas (a mesma câmera, em pé ou deitada): a camada é desenhada uma vez e
 * reaproveitada. Poucas entradas (a da prévia tem ~10 MB em pixels crus), as mais antigas saem.
 */
const camadas = new Map<string, Promise<Camada>>();
const MAXIMO_DE_CAMADAS = 8;

function camadaDeMarcas(largura: number, altura: number, larguraLogo: number) {
  const chave = `${largura}x${altura}:${larguraLogo}`;
  const existente = camadas.get(chave);
  // Usada agora: vai para o fim da fila de descarte.
  if (existente) camadas.delete(chave);
  else if (camadas.size >= MAXIMO_DE_CAMADAS) camadas.delete(camadas.keys().next().value!);
  return lembrar(camadas, chave, () =>
    existente ? existente : desenharCamada(largura, altura, larguraLogo),
  );
}

/** Camada transparente do tamanho da foto, coberta pelo padrão inclinado de marcas. */
async function desenharCamada(
  largura: number,
  altura: number,
  larguraLogo: number,
): Promise<Camada> {
  // Preenche um quadrado que cobre a foto mesmo depois de girado e recorta o centro.
  const lado = Math.ceil(Math.hypot(largura, altura)) + larguraLogo;
  const preenchido = await sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await ladrilho(larguraLogo), tile: true }])
    .raw()
    .toBuffer();
  const girado = await sharp(preenchido, { raw: { width: lado, height: lado, channels: 4 } })
    .rotate(INCLINACAO, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = await sharp(girado.data, {
    raw: { width: girado.info.width, height: girado.info.height, channels: 4 },
  })
    .extract({
      left: Math.floor((girado.info.width - largura) / 2),
      top: Math.floor((girado.info.height - altura) / 2),
      width: largura,
      height: altura,
    })
    .raw()
    .toBuffer();
  return { pixels, largura, altura };
}

/** A foto decodificada, já girada e em sRGB, em pixels crus. */
type Base = { pixels: Buffer; largura: number; altura: number; canais: 1 | 2 | 3 | 4 };

/**
 * Decodifica o original uma vez: gira pelo EXIF, reduz ao maior tamanho que alguma versão usa e
 * converte para sRGB (pelo perfil de cor embutido). O libjpeg lê o JPEG grande já reduzido
 * (1/2, 1/4 ou 1/8) quando o destino é bem menor, o que corta a maior parte do tempo.
 */
async function decodificar(original: Buffer, larguraMaxima: number): Promise<Base> {
  const { data, info } = await sharp(original)
    .rotate()
    .resize({
      width: larguraMaxima,
      height: larguraMaxima,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, largura: info.width, altura: info.height, canais: info.channels };
}

function daBase(base: Base) {
  return sharp(base.pixels, {
    raw: { width: base.largura, height: base.altura, channels: base.canais },
  });
}

/**
 * Reduz a base, grava as marcas e salva em WebP. Pixels crus não carregam metadados (GPS,
 * câmera): nada disso chega à versão pública (docs/riscos.md, Privacidade).
 */
async function versao(
  base: Base,
  larguraMaxima: number,
  larguraLogo: number,
  qualidade: number,
): Promise<ImagemGerada> {
  const { data, info } = await daBase(base)
    .resize({
      width: larguraMaxima,
      height: larguraMaxima,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const camada = await camadaDeMarcas(info.width, info.height, larguraLogo);
  const buffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .composite([
      { input: camada.pixels, raw: { width: camada.largura, height: camada.altura, channels: 4 } },
    ])
    // effort 2 (de 0 a 6): bem mais rápido que o padrão (4), com arquivo quase do mesmo tamanho.
    .webp({ quality: qualidade, effort: 2 })
    .toBuffer();
  return { buffer, largura: info.width, altura: info.height };
}

export type VersoesDaFoto = {
  previa: ImagemGerada;
  miniatura: ImagemGerada;
  /** JPEG reduzido e já girado para o reconhecimento facial. Nunca vai ao bucket público. */
  paraRostos: () => Promise<Buffer>;
};

/**
 * Prévia e miniatura, as duas com marca d'água, a partir de uma decodificação só do original. A
 * cópia para o reconhecimento facial sai da mesma base, só quando pedida.
 */
export async function gerarVersoes(original: Buffer): Promise<VersoesDaFoto> {
  const base = await decodificar(original, LARGURA_ROSTOS);
  const [previa, miniatura] = await Promise.all([
    versao(base, LARGURA_PREVIA, 300, 72),
    versao(base, LARGURA_MINIATURA, 120, 70),
  ]);
  return {
    previa,
    miniatura,
    paraRostos: () => daBase(base).jpeg({ quality: 85 }).toBuffer(),
  };
}

/** Prévia com marca d'água para a página da foto (~1600 px no lado maior). */
export async function gerarPrevia(original: Buffer): Promise<ImagemGerada> {
  return versao(await decodificar(original, LARGURA_PREVIA), LARGURA_PREVIA, 300, 72);
}

/** Miniatura com marca d'água para a grade da galeria (~400 px no lado maior). */
export async function gerarMiniatura(original: Buffer): Promise<ImagemGerada> {
  return versao(await decodificar(original, LARGURA_MINIATURA), LARGURA_MINIATURA, 120, 70);
}
