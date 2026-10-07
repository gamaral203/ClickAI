import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

// Gera as versões públicas de uma foto (docs/arquitetura.md, "Armazenamento").
// A marca d'água é gravada nos pixels: quem salva a prévia leva a marca junto. Junto com a
// baixa resolução, é a proteção real do original (docs/riscos.md, Segurança).
// Usada pelos dados de exemplo hoje e pelo job processar-foto na Fase 12.

export const LARGURA_PREVIA = 1600;
export const LARGURA_MINIATURA = 400;

/** Desenho da logo usado como carimbo. Na Fase 12, incluir no bundle do job (outputFileTracingIncludes). */
const CAMINHO_LOGO = path.join(process.cwd(), "public", "logo.png");

/** Inclinação do padrão de marcas, em graus. */
const INCLINACAO = -24;

export type ImagemGerada = {
  buffer: Buffer;
  largura: number;
  altura: number;
};

let logoEmCache: Promise<Buffer> | null = null;
function carregarLogo() {
  logoEmCache ??= readFile(CAMINHO_LOGO);
  return logoEmCache;
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
 * aparecer tanto em fotos claras quanto escuras, e um espaço em volta.
 */
async function ladrilho(larguraLogo: number) {
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
}

/** Camada transparente do tamanho da foto, coberta pelo padrão inclinado de marcas. */
async function camadaDeMarcas(largura: number, altura: number, larguraLogo: number) {
  // Preenche um quadrado que cobre a foto mesmo depois de girado e recorta o centro.
  const lado = Math.ceil(Math.hypot(largura, altura)) + larguraLogo;
  const preenchido = await sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await ladrilho(larguraLogo), tile: true }])
    .png()
    .toBuffer();
  const girado = await sharp(preenchido)
    .rotate(INCLINACAO, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp(girado.data)
    .extract({
      left: Math.floor((girado.info.width - largura) / 2),
      top: Math.floor((girado.info.height - altura) / 2),
      width: largura,
      height: altura,
    })
    .png()
    .toBuffer();
}

/**
 * Redimensiona respeitando a rotação do EXIF, converte para sRGB, grava as marcas e salva em
 * WebP. O Sharp descarta os metadados (GPS, câmera) por padrão (docs/riscos.md, Privacidade).
 */
async function gerar(
  original: Buffer,
  larguraMaxima: number,
  larguraLogo: number,
  qualidade: number,
) {
  const base = await sharp(original)
    .rotate()
    .resize({
      width: larguraMaxima,
      height: larguraMaxima,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .png()
    .toBuffer({ resolveWithObject: true });
  const { width: largura, height: altura } = base.info;

  const buffer = await sharp(base.data)
    .composite([{ input: await camadaDeMarcas(largura, altura, larguraLogo) }])
    .webp({ quality: qualidade })
    .toBuffer();
  return { buffer, largura, altura };
}

/** Prévia com marca d'água para a página da foto (~1600 px no lado maior). */
export function gerarPrevia(original: Buffer): Promise<ImagemGerada> {
  return gerar(original, LARGURA_PREVIA, 300, 72);
}

/** Miniatura com marca d'água para a grade da galeria (~400 px no lado maior). */
export function gerarMiniatura(original: Buffer): Promise<ImagemGerada> {
  return gerar(original, LARGURA_MINIATURA, 120, 70);
}
