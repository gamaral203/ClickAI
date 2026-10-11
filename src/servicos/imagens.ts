import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { LIMITE_PIXELS } from "@/lib/limites-envio";
import { MODELO_MARCA_PADRAO, type ModeloMarca } from "@/lib/marca-dagua";

// Gera as versões públicas de uma foto (docs/arquitetura.md, "Armazenamento").
// A marca d'água é gravada nos pixels: quem salva a prévia leva a marca junto. Junto com a
// baixa resolução, é a proteção real do original (docs/riscos.md, Segurança).
// Usada no processamento de cada foto enviada (src/servicos/envios.ts), na regeração das prévias
// antigas (src/servicos/regerar-previas.ts) e nos dados de exemplo.
//
// Contra a remoção por IA (docs/riscos.md, "Marca d'água removida com ferramentas de IA"): nenhuma
// marca resiste a um modelo generativo, então o objetivo é que o resultado da remoção fique
// inútil. A prévia é pequena (960 px no lado maior) e comprimida (WebP 62): o que sobra depois de
// limpar não serve para imprimir nem para postar em boa qualidade. A marca (versão 2,
// VERSAO_DA_MARCA em src/lib/marca-dagua.ts) tem três camadas:
//   1. uma logo GRANDE e semitransparente no meio da foto (cerca de metade da largura), com
//      "ClicouAí · PRÉVIA" embaixo, sobre quem foi fotografado: para tirar, a IA precisa inventar
//      o rosto e o corpo da pessoa;
//   2. o padrão inclinado de logos, alternando linhas de logos claras e de texto escuro, para
//      aparecer em fundo claro e escuro;
//   3. linhas finas cruzando a foto inteira em dois ângulos, claras e escuras alternadas, com
//      opacidade, espessura e vão variando de linha a linha (padrão menos previsível).
// Cada foto tem um deslocamento, uma inclinação do padrão e uma posição/rotação da logo central
// próprios (semente pelo id da foto): o padrão não é idêntico em todas, o que dificulta estimar
// e subtrair a marca a partir de várias prévias.
//
// Desempenho (uma foto de 24 MP por vez numa função de 1 vCPU): o original é decodificado uma
// vez só, já reduzido; as versões saem dessa base em pixels crus (sem PNG no meio); e as camadas
// de marcas (um pouco maiores que a foto, para o deslocamento) e a logo central ficam em memória
// por tamanho de foto e variação. Por foto, só o recorte da camada e a mistura.
//
// Formatos: JPEG, PNG, WebP, TIFF e AVIF (src/lib/tipos-imagem.ts). Arquivos grandes não estouram
// a memória: a leitura é sequencial e a redução acontece durante a decodificação (no JPEG e no
// WebP, o decodificador já lê em 1/2, 1/4 ou 1/8; nos outros, linha a linha, sem guardar a
// imagem inteira). Medido com 1 thread: JPEG de 100 MP em ~0,6 s e ~140 MB de memória; TIFF de
// 16 bits de 60 MP (260 MB) em ~1,4 s e ~430 MB, quase todo o arquivo em si.

/** Lado maior da prévia (página da foto e Open Graph). Era 1600 px na versão 1 da marca. */
export const LARGURA_PREVIA = 960;
export const LARGURA_MINIATURA = 400;
/** Qualidade do WebP da prévia e da miniatura (eram 72 e 70 na versão 1 da marca). */
export const QUALIDADE_PREVIA = 62;
export const QUALIDADE_MINIATURA = 65;
/** Largura da logo do padrão em cada versão. */
const LOGO_DA_PREVIA = 190;
const LOGO_DA_MINIATURA = 110;
/** Lado maior da cópia que vai ao reconhecimento facial (o Rekognition aceita até 5 MB). */
export const LARGURA_ROSTOS = 1920;

/** Desenhos usados como carimbo (vão no bundle das funções por outputFileTracingIncludes). */
const CAMINHO_LOGO = path.join(process.cwd(), "public", "logo.png");
/** "ClicouAí · PRÉVIA" já desenhado (PNG): não depende de fonte instalada no servidor. */
const CAMINHO_TEXTO = path.join(process.cwd(), "public", "marca-previa.png");

/** Inclinação do padrão de marcas, em graus; cada foto usa uma das variações. */
const INCLINACAO = -24;
const VARIACOES_DA_INCLINACAO = [-4, 0, 4] as const;
/** Ângulos das duas famílias de linhas finas, em graus (diferentes da inclinação das logos). */
const ANGULOS_DAS_LINHAS = [33, -61] as const;
/** Rotação da logo central, em graus; cada foto usa uma. */
const ROTACOES_DO_CENTRO = [-6, -3, 3, 6] as const;

/**
 * Desenho de cada modelo de marca d'água (src/lib/marca-dagua.ts). `escala` multiplica a largura
 * da logo do padrão; `espacoX`/`espacoY` são o vão entre logos, em proporção à logo; `centro` é
 * a logo grande no meio (fração da largura da foto e opacidade); `linhas` multiplica a
 * opacidade das linhas finas e a densidade delas. Desde a versão 2 da marca, todo modelo tem a
 * logo central e as linhas: os modelos mudam a intensidade, não a proteção mínima.
 */
type Estilo = {
  escala: number;
  opacidade: number;
  sombra: number;
  espacoX: number;
  espacoY: number;
  centro: { largura: number; opacidade: number };
  linhas: { opacidade: number; densidade: number };
};

const ESTILOS: Record<ModeloMarca, Estilo> = {
  discreta: {
    escala: 1.3,
    opacidade: 0.34,
    sombra: 0.16,
    espacoX: 1,
    espacoY: 2.4,
    centro: { largura: 0.44, opacidade: 0.36 },
    linhas: { opacidade: 0.75, densidade: 0.8 },
  },
  padrao: {
    escala: 1,
    opacidade: 0.46,
    sombra: 0.22,
    espacoX: 0.5,
    espacoY: 1.3,
    centro: { largura: 0.5, opacidade: 0.46 },
    linhas: { opacidade: 1, densidade: 1 },
  },
  densa: {
    escala: 0.7,
    opacidade: 0.5,
    sombra: 0.24,
    espacoX: 0.35,
    espacoY: 0.9,
    centro: { largura: 0.5, opacidade: 0.46 },
    linhas: { opacidade: 1, densidade: 1.2 },
  },
  central: {
    escala: 1.1,
    opacidade: 0.32,
    sombra: 0.15,
    espacoX: 0.8,
    espacoY: 2,
    centro: { largura: 0.6, opacidade: 0.5 },
    linhas: { opacidade: 0.85, densidade: 0.9 },
  },
  grade: {
    escala: 0.9,
    opacidade: 0.4,
    sombra: 0.18,
    espacoX: 0.9,
    espacoY: 1.8,
    centro: { largura: 0.5, opacidade: 0.4 },
    linhas: { opacidade: 1.35, densidade: 1.5 },
  },
  maxima: {
    escala: 0.7,
    opacidade: 0.54,
    sombra: 0.26,
    espacoX: 0.35,
    espacoY: 0.9,
    centro: { largura: 0.6, opacidade: 0.5 },
    linhas: { opacidade: 1.35, densidade: 1.5 },
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

/** Cache com no máximo `maximo` entradas; a usada agora vai para o fim da fila de descarte. */
function lembrarComLimite<T>(
  cache: Map<string, Promise<T>>,
  maximo: number,
  chave: string,
  criar: () => Promise<T>,
) {
  const existente = cache.get(chave);
  if (existente) {
    cache.delete(chave);
    cache.set(chave, existente);
    return existente;
  }
  if (cache.size >= maximo) cache.delete(cache.keys().next().value!);
  return lembrar(cache, chave, criar);
}

const desenhos = new Map<string, Promise<Buffer>>();
function carregar(caminho: string) {
  return lembrar(desenhos, caminho, () => readFile(caminho));
}

/** Número de 32 bits a partir de um texto (FNV-1a), para a semente de cada foto. */
function hashDoTexto(texto: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Sequência pseudoaleatória determinística (mulberry32), de 0 a 1. */
function sorteador(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Desenho = { buffer: Buffer; largura: number; altura: number };

/** Silhueta de um desenho numa cor só, com a transparência original multiplicada pela opacidade. */
async function silhueta(
  caminho: string,
  largura: number,
  cor: "branco" | "preto",
  opacidade: number,
): Promise<Desenho> {
  const { data: alfa, info } = await sharp(await carregar(caminho))
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
 * Um desenho com uma "sombra" deslocada na cor oposta, para aparecer em foto clara e escura. Em
 * PNG transparente, do tamanho do desenho mais o deslocamento.
 */
async function comSombra(
  caminho: string,
  largura: number,
  cor: "branco" | "preto",
  opacidade: number,
  opacidadeSombra: number,
): Promise<Desenho> {
  const [frente, sombra] = await Promise.all([
    silhueta(caminho, largura, cor, opacidade),
    silhueta(caminho, largura, cor === "branco" ? "preto" : "branco", opacidadeSombra),
  ]);
  const deslocamento = Math.max(1, Math.round(largura / 140));
  const buffer = await sharp({
    create: {
      width: frente.largura + deslocamento,
      height: frente.altura + deslocamento,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: sombra.buffer, left: deslocamento, top: deslocamento },
      { input: frente.buffer, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  return { buffer, largura: frente.largura + deslocamento, altura: frente.altura + deslocamento };
}

/**
 * Um "ladrilho" do padrão: numa linha, a logo clara (com sombra escura); na linha de baixo, o
 * texto "ClicouAí · PRÉVIA" escuro (com sombra clara). Linhas claras e escuras alternadas
 * aparecem em qualquer fundo. Um por largura de logo e modelo.
 */
const ladrilhos = new Map<string, Promise<Buffer>>();
function ladrilho(larguraLogo: number, modelo: ModeloMarca) {
  const estilo = ESTILOS[modelo];
  return lembrar(ladrilhos, `${modelo}:${larguraLogo}`, async () => {
    const [logo, texto] = await Promise.all([
      comSombra(CAMINHO_LOGO, larguraLogo, "branco", estilo.opacidade, estilo.sombra),
      comSombra(
        CAMINHO_TEXTO,
        Math.round(larguraLogo * 1.1),
        "preto",
        estilo.opacidade * 0.8,
        estilo.sombra,
      ),
    ]);
    const largura = Math.max(
      logo.largura + Math.round(larguraLogo * estilo.espacoX),
      texto.largura + Math.round(larguraLogo * estilo.espacoX * 0.5),
    );
    // Metade do vão vertical entre as duas linhas, metade depois do texto.
    const vao = Math.round((logo.altura * estilo.espacoY) / 2);
    const topoTexto = logo.altura + vao;
    const altura = topoTexto + texto.altura + vao;
    return sharp({
      create: {
        width: largura,
        height: altura,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: logo.buffer, left: 0, top: 0 },
        // Deslocado meio ladrilho para o lado: as linhas não ficam em coluna.
        {
          input: texto.buffer,
          left: Math.max(0, Math.round((largura - texto.largura) / 2)),
          top: topoTexto,
        },
      ])
      .png()
      .toBuffer();
  });
}

/**
 * Linhas finas cruzando a área inteira em dois ângulos, claras e escuras alternadas, com
 * opacidade, espessura e vão sorteados (sequência fixa por tamanho e variação), e algumas
 * faixas mais largas e suaves: mais difíceis de prever e de subtrair que uma grade uniforme. Em
 * SVG, só linhas: não depende de fonte instalada no servidor.
 */
function svgDasLinhas(largura: number, altura: number, estilo: Estilo, semente: number) {
  const sorteio = sorteador(semente);
  const base = Math.min(largura, altura * 1.5);
  const passo = Math.max(8, (base * 0.06) / estilo.linhas.densidade);
  const espessura = Math.max(0.8, base / 700);
  const cx = largura / 2;
  const cy = altura / 2;
  const meia = Math.hypot(largura, altura) / 2 + passo;
  const caminhos: string[] = [];
  for (const angulo of ANGULOS_DAS_LINHAS) {
    const rad = (angulo * Math.PI) / 180;
    const [dx, dy] = [Math.cos(rad), Math.sin(rad)];
    const [nx, ny] = [-dy, dx];
    let i = 0;
    for (let c = -meia + sorteio() * passo; c < meia; c += passo * (0.7 + sorteio() * 0.6)) {
      const clara = i++ % 2 === 0;
      const faixa = sorteio() < 0.15;
      const opacidade =
        (clara ? 0.2 + sorteio() * 0.25 : 0.14 + sorteio() * 0.2) *
        estilo.linhas.opacidade *
        (faixa ? 0.55 : 1);
      const largo = espessura * (faixa ? 3 + sorteio() * 2 : 0.8 + sorteio() * 0.7);
      const px = cx + nx * c;
      const py = cy + ny * c;
      caminhos.push(
        `<path d="M${(px - dx * meia).toFixed(1)},${(py - dy * meia).toFixed(1)}L${(px + dx * meia).toFixed(1)},${(py + dy * meia).toFixed(1)}" stroke="${clara ? "#fff" : "#000"}" stroke-opacity="${Math.min(0.8, opacidade).toFixed(3)}" stroke-width="${largo.toFixed(2)}"/>`,
      );
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" fill="none">${caminhos.join("")}</svg>`,
  );
}

type Camada = { pixels: Buffer; largura: number; altura: number };

/**
 * Camadas de marcas já desenhadas (padrão de logos e linhas), por tamanho de foto, modelo e
 * variação da inclinação. Um pouco maiores que a foto (folgaDaCamada): cada foto recorta a sua
 * janela com um deslocamento próprio. As fotos de um evento quase sempre têm as mesmas medidas
 * (a mesma câmera, em pé ou deitada): cada camada é desenhada uma vez e reaproveitada. Poucas
 * entradas (a da prévia tem ~3 MB em pixels crus), as mais antigas saem.
 */
const camadas = new Map<string, Promise<Camada>>();
const centros = new Map<string, Promise<Camada>>();
const MAXIMO_DE_CAMADAS = 18;

function folgaDaCamada(largura: number, altura: number) {
  return Math.max(16, Math.round(Math.min(largura, altura) * 0.12));
}

function camadaDeMarcas(
  largura: number,
  altura: number,
  larguraLogo: number,
  modelo: ModeloMarca,
  variacao: number,
) {
  return lembrarComLimite(
    camadas,
    MAXIMO_DE_CAMADAS,
    `${modelo}:${largura}x${altura}:${larguraLogo}:${variacao}`,
    () => desenharCamada(largura, altura, larguraLogo, modelo, variacao),
  );
}

/** Camada transparente um pouco maior que a foto, coberta pelo padrão inclinado e pelas linhas. */
async function desenharCamada(
  largura: number,
  altura: number,
  larguraLogo: number,
  modelo: ModeloMarca,
  variacao: number,
): Promise<Camada> {
  const estilo = ESTILOS[modelo];
  const folga = folgaDaCamada(largura, altura);
  const [w, h] = [largura + folga, altura + folga];
  const logoDoModelo = Math.max(16, Math.round(larguraLogo * estilo.escala));
  // Preenche um quadrado que cobre a área mesmo depois de girado e recorta o centro.
  const lado = Math.ceil(Math.hypot(w, h)) + logoDoModelo * 2;
  const preenchido = await sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await ladrilho(logoDoModelo, modelo), tile: true }])
    .raw()
    .toBuffer();
  const girado = await sharp(preenchido, { raw: { width: lado, height: lado, channels: 4 } })
    .rotate(INCLINACAO + VARIACOES_DA_INCLINACAO[variacao], {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const recortado = await sharp(girado.data, {
    raw: { width: girado.info.width, height: girado.info.height, channels: 4 },
  })
    .extract({
      left: Math.floor((girado.info.width - w) / 2),
      top: Math.floor((girado.info.height - h) / 2),
      width: w,
      height: h,
    })
    .raw()
    .toBuffer();
  const pixels = await sharp(recortado, { raw: { width: w, height: h, channels: 4 } })
    .composite([{ input: svgDasLinhas(w, h, estilo, hashDoTexto(`${w}x${h}:${variacao}`)) }])
    .raw()
    .toBuffer();
  return { pixels, largura: w, altura: h };
}

/**
 * A logo grande do meio, com "ClicouAí · PRÉVIA" embaixo, clara com sombra escura e levemente
 * girada (uma das ROTACOES_DO_CENTRO). Em pixels crus, por tamanho de foto, modelo e rotação.
 */
function centroDaMarca(largura: number, altura: number, modelo: ModeloMarca, rotacao: number) {
  return lembrarComLimite(
    centros,
    MAXIMO_DE_CAMADAS,
    `${modelo}:${largura}x${altura}:${rotacao}`,
    () => desenharCentro(largura, altura, modelo, rotacao),
  );
}

async function desenharCentro(
  largura: number,
  altura: number,
  modelo: ModeloMarca,
  rotacao: number,
): Promise<Camada> {
  const { centro } = ESTILOS[modelo];
  // Em panorâmica, a altura limita para caber; em foto em pé, a logo ocupa mais da largura (a
  // pessoa costuma preencher a foto).
  const fracao = Math.min(0.75, centro.largura * (altura > largura ? 1.25 : 1));
  const larguraLogo = Math.max(24, Math.round(Math.min(largura, altura * 1.9) * fracao));
  const [logo, texto] = await Promise.all([
    comSombra(CAMINHO_LOGO, larguraLogo, "branco", centro.opacidade, centro.opacidade * 0.65),
    comSombra(
      CAMINHO_TEXTO,
      Math.round(larguraLogo * 0.9),
      "branco",
      centro.opacidade * 0.9,
      centro.opacidade * 0.5,
    ),
  ]);
  const vao = Math.round(logo.altura * 0.12);
  const w = Math.max(logo.largura, texto.largura);
  const h = logo.altura + vao + texto.altura;
  const montado = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: logo.buffer, left: Math.round((w - logo.largura) / 2), top: 0 },
      { input: texto.buffer, left: Math.round((w - texto.largura) / 2), top: logo.altura + vao },
    ])
    .png()
    .toBuffer();
  const { data, info } = await sharp(montado)
    .rotate(rotacao, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    // Nunca maior que a foto (o composite do Sharp exige caber).
    .resize({ width: largura, height: altura, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, largura: info.width, altura: info.height };
}

/** Variações da marca desta foto, tiradas da semente (o id da foto). */
function variacoesDaFoto(semente: string, largura: number, altura: number) {
  const sorteio = sorteador(hashDoTexto(semente));
  const folga = folgaDaCamada(largura, altura);
  return {
    variacao: Math.floor(sorteio() * VARIACOES_DA_INCLINACAO.length),
    dx: Math.floor(sorteio() * folga),
    dy: Math.floor(sorteio() * folga),
    rotacao: ROTACOES_DO_CENTRO[Math.floor(sorteio() * ROTACOES_DO_CENTRO.length)],
    // Centro da logo grande: perto do meio (até 5% para os lados) e um pouco acima, onde
    // costumam ficar rosto e tronco.
    cx: 0.5 + (sorteio() - 0.5) * 0.1,
    cy: 0.46 + (sorteio() - 0.5) * 0.08,
  };
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
  semente: string,
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
  const [largura, altura] = [info.width, info.height];
  const v = variacoesDaFoto(semente, largura, altura);
  const [camada, centro] = await Promise.all([
    camadaDeMarcas(largura, altura, larguraLogo, modelo, v.variacao),
    centroDaMarca(largura, altura, modelo, v.rotacao),
  ]);
  // A janela desta foto na camada (deslocamento próprio).
  const janela = await sharp(camada.pixels, {
    raw: { width: camada.largura, height: camada.altura, channels: 4 },
  })
    .extract({ left: v.dx, top: v.dy, width: largura, height: altura })
    .raw()
    .toBuffer();
  const left = Math.max(
    0,
    Math.min(largura - centro.largura, Math.round(largura * v.cx - centro.largura / 2)),
  );
  const top = Math.max(
    0,
    Math.min(altura - centro.altura, Math.round(altura * v.cy - centro.altura / 2)),
  );
  const buffer = await sharp(data, {
    raw: { width: largura, height: altura, channels: info.channels },
  })
    .composite([
      { input: janela, raw: { width: largura, height: altura, channels: 4 } },
      {
        input: centro.pixels,
        raw: { width: centro.largura, height: centro.altura, channels: 4 },
        left,
        top,
      },
    ])
    // effort 2 (de 0 a 6): bem mais rápido que o padrão (4), com arquivo quase do mesmo tamanho.
    .webp({ quality: qualidade, effort: 2 })
    .toBuffer();
  return { buffer, largura, altura };
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
 * base, só quando pedida. `semente` (o id da foto) varia o deslocamento e a rotação da marca.
 */
export async function gerarVersoes(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  semente = "",
): Promise<VersoesDaFoto> {
  const base = await decodificar(original, LARGURA_ROSTOS);
  const [previa, miniatura] = await Promise.all([
    versao(base, LARGURA_PREVIA, LOGO_DA_PREVIA, QUALIDADE_PREVIA, modelo, semente),
    versao(base, LARGURA_MINIATURA, LOGO_DA_MINIATURA, QUALIDADE_MINIATURA, modelo, semente),
  ]);
  return {
    previa,
    miniatura,
    paraRostos: () => daBase(base).jpeg({ quality: 85 }).toBuffer(),
  };
}

/** Prévia com marca d'água para a página da foto (LARGURA_PREVIA no lado maior). */
export async function gerarPrevia(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  semente = "",
): Promise<ImagemGerada> {
  return versao(
    await decodificar(original, LARGURA_PREVIA),
    LARGURA_PREVIA,
    LOGO_DA_PREVIA,
    QUALIDADE_PREVIA,
    modelo,
    semente,
  );
}

/** Miniatura com marca d'água para a grade da galeria (LARGURA_MINIATURA no lado maior). */
export async function gerarMiniatura(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  semente = "",
): Promise<ImagemGerada> {
  return versao(
    await decodificar(original, LARGURA_MINIATURA),
    LARGURA_MINIATURA,
    LOGO_DA_MINIATURA,
    QUALIDADE_MINIATURA,
    modelo,
    semente,
  );
}

/**
 * Amostra de um modelo de marca d'água numa foto de exemplo, para a escolha no painel. Sai do
 * mesmo código das prévias de verdade (o que o fotógrafo vê é o que o cliente vai ver).
 */
export async function amostraDaMarca(modelo: ModeloMarca): Promise<Buffer> {
  const foto = await readFile(path.join(process.cwd(), "public", "inicio", "ensaio-casal.webp"));
  const base = await decodificar(foto, 800);
  return (await versao(base, 800, 160, 78, modelo, "amostra")).buffer;
}

/** Cópia reduzida e já girada para o reconhecimento facial (JPEG, até LARGURA_ROSTOS). */
export async function copiaParaRostos(original: Buffer): Promise<Buffer> {
  return daBase(await decodificar(original, LARGURA_ROSTOS))
    .jpeg({ quality: 85 })
    .toBuffer();
}
