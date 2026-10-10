import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp, { type OverlayOptions } from "sharp";

import { LIMITE_PIXELS } from "@/lib/limites-envio";
import { MODELO_MARCA_PADRAO, type ModeloMarca } from "@/lib/marca-dagua";

// Gera as versões públicas de uma foto (docs/arquitetura.md, "Armazenamento").
// A marca d'água é gravada nos pixels: quem salva a prévia leva a marca junto. Junto com a
// baixa resolução, é a proteção real do original (docs/riscos.md, Segurança).
// Usada no processamento de cada foto enviada (src/servicos/envios.ts) e nos dados de exemplo.
//
// Desempenho (uma foto de 24 MP por vez numa função de 1 vCPU): o original é decodificado uma
// vez só, já reduzido; as versões saem dessa base em pixels crus (sem PNG no meio); e o padrão
// de marcas, igual para todas as fotos do mesmo tamanho, fica em memória entre as fotos.
//
// Formatos: JPEG, PNG, WebP, TIFF e AVIF (src/lib/tipos-imagem.ts). Arquivos grandes não estouram
// a memória: a leitura é sequencial e a redução acontece durante a decodificação (no JPEG e no
// WebP, o decodificador já lê em 1/2, 1/4 ou 1/8; nos outros, linha a linha, sem guardar a
// imagem inteira). Medido com 1 thread: JPEG de 100 MP em ~0,6 s e ~140 MB de memória; TIFF de
// 16 bits de 60 MP (260 MB) em ~1,4 s e ~430 MB, quase todo o arquivo em si.

export const LARGURA_PREVIA = 1600;
export const LARGURA_MINIATURA = 400;
/** Lado maior da cópia que vai ao reconhecimento facial (o Rekognition aceita até 5 MB). */
export const LARGURA_ROSTOS = 1920;

/** Desenho da logo usado como carimbo (vai no bundle das funções por outputFileTracingIncludes). */
const CAMINHO_LOGO = path.join(process.cwd(), "public", "logo.png");

/** Inclinação do padrão de marcas, em graus. */
const INCLINACAO = -24;

/**
 * Desenho de cada modelo de marca d'água (src/lib/marca-dagua.ts). `escala` multiplica a largura
 * da logo de cada versão; `espacoX`/`espacoY` são o vão entre logos, em proporção à logo;
 * `centro` põe uma logo grande no meio (fração da largura da foto); `grade` cruza linhas finas
 * na diagonal (passo em fração da largura).
 */
type Estilo = {
  escala: number;
  opacidade: number;
  sombra: number;
  espacoX: number;
  espacoY: number;
  centro?: { largura: number; opacidade: number };
  grade?: { passo: number; opacidade: number };
};

const ESTILOS: Record<ModeloMarca, Estilo> = {
  discreta: { escala: 1.4, opacidade: 0.28, sombra: 0.12, espacoX: 1.3, espacoY: 3.4 },
  padrao: { escala: 1, opacidade: 0.42, sombra: 0.18, espacoX: 0.55, espacoY: 1.6 },
  densa: { escala: 0.7, opacidade: 0.46, sombra: 0.2, espacoX: 0.35, espacoY: 1 },
  central: {
    escala: 1.1,
    opacidade: 0.24,
    sombra: 0.1,
    espacoX: 0.9,
    espacoY: 2.4,
    centro: { largura: 0.55, opacidade: 0.55 },
  },
  grade: {
    escala: 0.9,
    opacidade: 0.34,
    sombra: 0.14,
    espacoX: 1.1,
    espacoY: 2.2,
    grade: { passo: 0.2, opacidade: 0.5 },
  },
  maxima: {
    escala: 0.7,
    opacidade: 0.5,
    sombra: 0.22,
    espacoX: 0.35,
    espacoY: 1,
    centro: { largura: 0.6, opacidade: 0.6 },
    grade: { passo: 0.16, opacidade: 0.5 },
  },
};

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

/** A logo em branco e a sombra escura que vai deslocada por baixo dela. */
async function logoComSombra(larguraLogo: number, opacidade: number, opacidadeSombra: number) {
  const [clara, sombra] = await Promise.all([
    silhueta(larguraLogo, "branco", opacidade),
    silhueta(larguraLogo, "preto", opacidadeSombra),
  ]);
  return { clara, sombra, deslocamento: Math.max(1, Math.round(larguraLogo / 140)) };
}

/**
 * Um "ladrilho" do padrão: a logo em branco com uma sombra escura deslocada, para a marca
 * aparecer tanto em fotos claras quanto escuras, e um espaço em volta. Um por largura de logo.
 */
const ladrilhos = new Map<string, Promise<Buffer>>();
function ladrilho(larguraLogo: number, modelo: ModeloMarca) {
  const estilo = ESTILOS[modelo];
  return lembrar(ladrilhos, `${modelo}:${larguraLogo}`, async () => {
    const { clara, sombra, deslocamento } = await logoComSombra(
      larguraLogo,
      estilo.opacidade,
      estilo.sombra,
    );
    const espacoX = Math.round(larguraLogo * estilo.espacoX);
    const espacoY = Math.round(clara.altura * estilo.espacoY);
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

function camadaDeMarcas(largura: number, altura: number, larguraLogo: number, modelo: ModeloMarca) {
  const chave = `${modelo}:${largura}x${altura}:${larguraLogo}`;
  const existente = camadas.get(chave);
  // Usada agora: vai para o fim da fila de descarte.
  if (existente) camadas.delete(chave);
  else if (camadas.size >= MAXIMO_DE_CAMADAS) camadas.delete(camadas.keys().next().value!);
  return lembrar(camadas, chave, () =>
    existente ? existente : desenharCamada(largura, altura, larguraLogo, modelo),
  );
}

/**
 * Linhas finas cruzadas na diagonal (as duas direções), claras com uma sombra escura do lado,
 * em SVG do tamanho da foto. Só linhas: não depende de fonte instalada no servidor.
 */
function svgDaGrade(largura: number, altura: number, passo: number, opacidade: number) {
  const espessura = Math.max(1, Math.round(largura / 600));
  const linhas: string[] = [];
  for (let x = -altura; x < largura + altura; x += passo) {
    linhas.push(`M${x},0L${x + altura},${altura}`, `M${x + altura},0L${x},${altura}`);
  }
  const d = linhas.join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">` +
      `<path d="${d}" stroke="#000" stroke-opacity="${(opacidade * 0.45).toFixed(3)}" stroke-width="${espessura}" transform="translate(${espessura},${espessura})" fill="none"/>` +
      `<path d="${d}" stroke="#fff" stroke-opacity="${opacidade.toFixed(3)}" stroke-width="${espessura}" fill="none"/>` +
      `</svg>`,
  );
}

/** Camada transparente do tamanho da foto, coberta pelo padrão inclinado de marcas. */
async function desenharCamada(
  largura: number,
  altura: number,
  larguraLogo: number,
  modelo: ModeloMarca,
): Promise<Camada> {
  const estilo = ESTILOS[modelo];
  const logoDoModelo = Math.max(16, Math.round(larguraLogo * estilo.escala));
  // Preenche um quadrado que cobre a foto mesmo depois de girado e recorta o centro.
  const lado = Math.ceil(Math.hypot(largura, altura)) + logoDoModelo;
  const preenchido = await sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await ladrilho(logoDoModelo, modelo), tile: true }])
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
  if (!estilo.centro && !estilo.grade) return { pixels, largura, altura };

  // Por cima do padrão: a grade e a logo grande no meio, nos modelos que têm.
  const extras: OverlayOptions[] = [];
  if (estilo.grade) {
    const passo = Math.max(24, Math.round(largura * estilo.grade.passo));
    extras.push({ input: svgDaGrade(largura, altura, passo, estilo.grade.opacidade) });
  }
  if (estilo.centro) {
    const larguraCentro = Math.round(Math.min(largura, altura * 2.4) * estilo.centro.largura);
    const { clara, sombra, deslocamento } = await logoComSombra(
      larguraCentro,
      estilo.centro.opacidade,
      estilo.centro.opacidade * 0.4,
    );
    const left = Math.round((largura - clara.largura) / 2);
    const top = Math.round((altura - clara.altura) / 2);
    extras.push(
      { input: sombra.buffer, left: left + deslocamento, top: top + deslocamento },
      { input: clara.buffer, left, top },
    );
  }
  const comExtras = await sharp(pixels, { raw: { width: largura, height: altura, channels: 4 } })
    .composite(extras)
    .raw()
    .toBuffer();
  return { pixels: comExtras, largura, altura };
}

/** A foto decodificada, já girada e em sRGB, em pixels crus de 8 bits. */
type Base = { pixels: Buffer; largura: number; altura: number; canais: 1 | 2 | 3 | 4 };

/**
 * Abre o original no Sharp com os limites do envio: no máximo LIMITE_PIXELS (barra a "bomba de
 * descompressão") e leitura sequencial (a imagem passa pela redução em faixas, sem ficar
 * inteira na memória). Arquivo com várias páginas (TIFF, WebP animado): só a primeira.
 */
export function abrirOriginal(original: Buffer) {
  return sharp(original, { limitInputPixels: LIMITE_PIXELS, sequentialRead: true });
}

/**
 * Decodifica o original uma vez: gira pelo EXIF, reduz ao maior tamanho que alguma versão usa,
 * achata a transparência sobre branco (PNG, WebP, TIFF ou AVIF com alfa: sem isso, o fundo
 * transparente sairia preto ou com a cor escondida nos pixels invisíveis) e converte para sRGB
 * de 8 bits (pelo perfil de cor embutido; TIFF e PNG de 16 bits também). O libjpeg lê o JPEG
 * grande já reduzido (1/2, 1/4 ou 1/8) quando o destino é bem menor, o que corta a maior parte
 * do tempo.
 */
async function decodificar(original: Buffer, larguraMaxima: number): Promise<Base> {
  const { data, info } = await abrirOriginal(original)
    .rotate()
    .resize({
      width: larguraMaxima,
      height: larguraMaxima,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw({ depth: "uchar" })
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
  modelo: ModeloMarca,
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
  const camada = await camadaDeMarcas(info.width, info.height, larguraLogo, modelo);
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
 * Prévia e miniatura, as duas com marca d'água (no modelo escolhido pelo dono do evento), a
 * partir de uma decodificação só do original. A cópia para o reconhecimento facial sai da mesma
 * base, só quando pedida.
 */
export async function gerarVersoes(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
): Promise<VersoesDaFoto> {
  const base = await decodificar(original, LARGURA_ROSTOS);
  const [previa, miniatura] = await Promise.all([
    versao(base, LARGURA_PREVIA, 300, 72, modelo),
    versao(base, LARGURA_MINIATURA, 120, 70, modelo),
  ]);
  return {
    previa,
    miniatura,
    paraRostos: () => daBase(base).jpeg({ quality: 85 }).toBuffer(),
  };
}

/** Prévia com marca d'água para a página da foto (~1600 px no lado maior). */
export async function gerarPrevia(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
): Promise<ImagemGerada> {
  return versao(await decodificar(original, LARGURA_PREVIA), LARGURA_PREVIA, 300, 72, modelo);
}

/** Miniatura com marca d'água para a grade da galeria (~400 px no lado maior). */
export async function gerarMiniatura(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
): Promise<ImagemGerada> {
  return versao(await decodificar(original, LARGURA_MINIATURA), LARGURA_MINIATURA, 120, 70, modelo);
}

/**
 * Amostra de um modelo de marca d'água numa foto de exemplo, para a escolha no painel. Sai do
 * mesmo código das prévias de verdade (o que o fotógrafo vê é o que o cliente vai ver).
 */
export async function amostraDaMarca(modelo: ModeloMarca): Promise<Buffer> {
  const foto = await readFile(path.join(process.cwd(), "public", "inicio", "ensaio-casal.webp"));
  const base = await decodificar(foto, 800);
  return (await versao(base, 800, 150, 78, modelo)).buffer;
}

/** Cópia reduzida e já girada para o reconhecimento facial (JPEG, até LARGURA_ROSTOS). */
export async function copiaParaRostos(original: Buffer): Promise<Buffer> {
  return daBase(await decodificar(original, LARGURA_ROSTOS))
    .jpeg({ quality: 85 })
    .toBuffer();
}
