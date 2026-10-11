import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { LIMITE_PIXELS } from "@/lib/limites-envio";
import { MODELO_MARCA_PADRAO, type ModeloMarca } from "@/lib/marca-dagua";
import type { CaixaDoRosto } from "@/lib/reconhecimento";

// Gera as versões públicas de uma foto (docs/arquitetura.md, "Armazenamento").
// A marca d'água é gravada nos pixels: quem salva a prévia leva a marca junto. Junto com a
// baixa resolução, é a proteção real do original (docs/riscos.md, Segurança).
// Usada no processamento de cada foto enviada (src/servicos/envios.ts), na regeração das prévias
// antigas (src/servicos/regerar-previas.ts) e nos dados de exemplo.
//
// Contra a remoção por IA (docs/riscos.md, "Marca d'água removida com ferramentas de IA"): nenhuma
// marca resiste a um modelo generativo, então o objetivo é que o resultado da remoção fique
// inútil. A prévia é pequena (800 px no lado maior) e comprimida (WebP 55): o que sobra depois de
// limpar não serve para imprimir nem para postar em boa qualidade. A marca (versão 2,
// VERSAO_DA_MARCA em src/lib/marca-dagua.ts) tem, de baixo para cima:
//   1. uma grade diagonal densa do texto "ClicouAí", com linhas claras e escuras alternadas
//      (aparece em fundo claro e escuro), a 30–40% de opacidade;
//   2. uma malha de linhas finas em dois ângulos (vão de ~24 a 40 px, 20–30% de opacidade),
//      claras e escuras, com vão, espessura e ângulo irregulares, e algumas faixas largas
//      semitransparentes (~15–20%) atravessando a foto, com hachura por dentro;
//   3. a marca principal: "ClicouAí" grande e "PRÉVIA · NÃO AUTORIZADA" embaixo, preenchimento
//      claro com contorno escuro (aparece em qualquer fundo), a 65–75% de opacidade, cobrindo
//      ~70% da largura e levemente girada. Quando a posição dos rostos é conhecida (tabela
//      `rostos`), ela fica sobre o MAIOR rosto e o tronco, e os outros rostos grandes ganham uma
//      marca menor; sem rostos, fica no centro, um pouco acima do meio. Para tirar, a IA precisa
//      inventar o rosto da pessoa.
// Tudo varia por foto (semente pelo id): inclinação e deslocamento da grade, vãos, espessuras e
// ângulos das linhas, posição e ângulo das faixas, rotação e posição da marca principal. Não
// existe um molde fixo para estimar e subtrair a partir de várias prévias.
//
// Desempenho (uma foto de 24 MP por vez numa função de 1 vCPU): o original é decodificado uma
// vez só, já reduzido; as versões saem dessa base em pixels crus (sem PNG no meio). A grade de
// texto (um pouco maior que a foto, para o deslocamento) e a marca principal sem rotação ficam
// em memória por tamanho; por foto, só o recorte da grade, o SVG das linhas e faixas, a rotação
// da marca principal e a mistura.
//
// Formatos: JPEG, PNG, WebP, TIFF e AVIF (src/lib/tipos-imagem.ts). Arquivos grandes não estouram
// a memória: a leitura é sequencial e a redução acontece durante a decodificação (no JPEG e no
// WebP, o decodificador já lê em 1/2, 1/4 ou 1/8; nos outros, linha a linha, sem guardar a
// imagem inteira). Medido com 1 thread: JPEG de 100 MP em ~0,6 s e ~140 MB de memória; TIFF de
// 16 bits de 60 MP (260 MB) em ~1,4 s e ~430 MB, quase todo o arquivo em si.

/** Lado maior da prévia (página da foto e Open Graph). Era 1600 px na versão 1 da marca. */
export const LARGURA_PREVIA = 800;
export const LARGURA_MINIATURA = 400;
/** Qualidade do WebP da prévia e da miniatura (eram 72 e 70 na versão 1 da marca). */
export const QUALIDADE_PREVIA = 55;
export const QUALIDADE_MINIATURA = 55;
/** Lado maior da cópia que vai ao reconhecimento facial (o Rekognition aceita até 5 MB). */
export const LARGURA_ROSTOS = 1920;
/**
 * As medidas da marca (texto da grade, vão das linhas, espessuras) são para este lado maior; nas
 * outras versões, proporcionais (a miniatura de 400 px leva a mesma marca pela metade).
 */
const LADO_DE_REFERENCIA = 800;

/** Textos já desenhados (PNG branco): não dependem de fonte instalada no servidor. */
const CAMINHO_NOME = path.join(process.cwd(), "public", "marca-clicouai.png");
const CAMINHO_AVISO = path.join(process.cwd(), "public", "marca-nao-autorizada.png");

/** Inclinação da grade de texto, em graus; cada foto usa uma. */
const INCLINACOES_DA_GRADE = [-32, -24, -16, 22] as const;
/** Ângulos de base das duas famílias de linhas; cada foto varia até ±8°. */
const ANGULOS_DAS_LINHAS = [33, -57] as const;
/** Rotação da marca principal: até este tanto para cada lado, sorteada por foto. */
const ROTACAO_MAXIMA = 10;
/** Marcas menores sobre os outros rostos grandes, no máximo. */
const MARCAS_EXTRAS = 4;

/**
 * Desenho de cada modelo de marca d'água (src/lib/marca-dagua.ts). Desde a versão 2, todo
 * modelo tem as quatro camadas no nível de proteção alto; os modelos só mudam a intensidade.
 * - `grade`: opacidade do texto, largura dele (px a 800) e vãos (fração do texto);
 * - `centro`: largura da marca principal (fração da largura da foto) e opacidade;
 * - `linhas`: opacidade e vão médio (px a 800; cada linha varia de 0,75 a 1,25 vez);
 * - `faixas`: opacidade e quantidade.
 */
type Estilo = {
  grade: { opacidade: number; texto: number; espacoX: number; espacoY: number };
  centro: { largura: number; opacidade: number };
  linhas: { opacidade: number; passo: number };
  faixas: { opacidade: number; quantas: number };
};

const ESTILOS: Record<ModeloMarca, Estilo> = {
  discreta: {
    grade: { opacidade: 0.3, texto: 118, espacoX: 0.5, espacoY: 1.5 },
    centro: { largura: 0.66, opacidade: 0.65 },
    linhas: { opacidade: 0.2, passo: 36 },
    faixas: { opacidade: 0.15, quantas: 2 },
  },
  padrao: {
    grade: { opacidade: 0.34, texto: 104, espacoX: 0.4, espacoY: 1.2 },
    centro: { largura: 0.7, opacidade: 0.7 },
    linhas: { opacidade: 0.24, passo: 32 },
    faixas: { opacidade: 0.17, quantas: 3 },
  },
  densa: {
    grade: { opacidade: 0.36, texto: 88, espacoX: 0.32, espacoY: 1 },
    centro: { largura: 0.7, opacidade: 0.7 },
    linhas: { opacidade: 0.26, passo: 30 },
    faixas: { opacidade: 0.17, quantas: 3 },
  },
  central: {
    grade: { opacidade: 0.3, texto: 110, espacoX: 0.45, espacoY: 1.4 },
    centro: { largura: 0.75, opacidade: 0.75 },
    linhas: { opacidade: 0.22, passo: 34 },
    faixas: { opacidade: 0.16, quantas: 2 },
  },
  grade: {
    grade: { opacidade: 0.32, texto: 104, espacoX: 0.4, espacoY: 1.3 },
    centro: { largura: 0.7, opacidade: 0.68 },
    linhas: { opacidade: 0.3, passo: 26 },
    faixas: { opacidade: 0.18, quantas: 3 },
  },
  maxima: {
    grade: { opacidade: 0.4, texto: 88, espacoX: 0.3, espacoY: 1 },
    centro: { largura: 0.75, opacidade: 0.75 },
    linhas: { opacidade: 0.3, passo: 24 },
    faixas: { opacidade: 0.2, quantas: 4 },
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

/** Imagem RGBA em pixels crus (sem premultiplicar), como o composite do Sharp recebe. */
type Pixels = { pixels: Buffer; largura: number; altura: number };

function vazio(largura: number, altura: number): Pixels {
  return { pixels: Buffer.alloc(largura * altura * 4), largura, altura };
}

/**
 * Cola `de` sobre `em` na posição (x, y), misturando pela transparência ("over"). Com `repetir`,
 * o que passa da borda volta pelo outro lado (para ladrilhos sem emenda).
 */
function colar(em: Pixels, de: Pixels, x: number, y: number, repetir = false) {
  for (let j = 0; j < de.altura; j++) {
    let yy = y + j;
    if (repetir) yy = ((yy % em.altura) + em.altura) % em.altura;
    else if (yy < 0 || yy >= em.altura) continue;
    for (let i = 0; i < de.largura; i++) {
      let xx = x + i;
      if (repetir) xx = ((xx % em.largura) + em.largura) % em.largura;
      else if (xx < 0 || xx >= em.largura) continue;
      const o = (j * de.largura + i) * 4;
      const a = de.pixels[o + 3] / 255;
      if (a === 0) continue;
      const d = (yy * em.largura + xx) * 4;
      const b = em.pixels[d + 3] / 255;
      const sai = a + b * (1 - a);
      for (let c = 0; c < 3; c++) {
        em.pixels[d + c] = Math.round(
          (de.pixels[o + c] * a + em.pixels[d + c] * b * (1 - a)) / sai,
        );
      }
      em.pixels[d + 3] = Math.round(sai * 255);
    }
  }
}

/**
 * Um texto (PNG branco com transparência) numa cor de preenchimento, com contorno na cor oposta.
 * O contorno é a máscara dilatada por um círculo de raio `espessura`.
 */
async function letreiro(
  caminho: string,
  largura: number,
  {
    clara,
    opacidade,
    opacidadeContorno,
    espessura,
  }: { clara: boolean; opacidade: number; opacidadeContorno: number; espessura: number },
): Promise<Pixels> {
  const { data: alfa, info } = await sharp(await carregar(caminho))
    .resize({ width: Math.max(8, Math.round(largura)) })
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const m = Math.max(0, Math.round(espessura));
  const [w, h] = [info.width + 2 * m, info.height + 2 * m];
  const preenchido = new Uint8Array(w * h);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      preenchido[(y + m) * w + x + m] = alfa[y * info.width + x];
    }
  }
  // Dilatação: cada pixel do texto "carimba" um disco de raio m na máscara do contorno.
  const contorno = new Uint8Array(preenchido);
  if (m > 0) {
    const disco: number[] = [];
    for (let dy = -m; dy <= m; dy++) {
      for (let dx = -m; dx <= m; dx++) if (dx * dx + dy * dy <= m * m + m) disco.push(dy * w + dx);
    }
    for (let y = m; y < h - m; y++) {
      for (let x = m; x < w - m; x++) {
        const p = y * w + x;
        const v = preenchido[p];
        if (v === 0) continue;
        for (const d of disco) if (contorno[p + d] < v) contorno[p + d] = v;
      }
    }
  }
  const [frente, fundo] = clara ? [255, 0] : [0, 255];
  const pixels = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const a = (preenchido[p] / 255) * opacidade;
    const b = (contorno[p] / 255) * opacidadeContorno;
    const sai = a + b * (1 - a);
    if (sai === 0) continue;
    const cor = Math.round((frente * a + fundo * b * (1 - a)) / sai);
    pixels[p * 4] = pixels[p * 4 + 1] = pixels[p * 4 + 2] = cor;
    pixels[p * 4 + 3] = Math.round(sai * 255);
  }
  return { pixels, largura: w, altura: h };
}

// ---------------------------------------------------------------- 1. Grade de texto

/**
 * Ladrilho da grade: uma linha de "ClicouAí" claro (contorno escuro fino) e, embaixo, uma de
 * "ClicouAí" escuro (contorno claro), deslocada meio passo. Repete sem emenda.
 */
const ladrilhos = new Map<string, Promise<Pixels>>();
function ladrilho(larguraTexto: number, modelo: ModeloMarca, escala: number) {
  const { grade } = ESTILOS[modelo];
  return lembrarComLimite(ladrilhos, 12, `${modelo}:${larguraTexto}`, async () => {
    const espessura = Math.max(1, Math.round(1.2 * escala));
    const [claro, escuro] = await Promise.all([
      letreiro(CAMINHO_NOME, larguraTexto, {
        clara: true,
        opacidade: grade.opacidade,
        opacidadeContorno: grade.opacidade * 0.7,
        espessura,
      }),
      letreiro(CAMINHO_NOME, larguraTexto, {
        clara: false,
        opacidade: grade.opacidade,
        opacidadeContorno: grade.opacidade * 0.6,
        espessura,
      }),
    ]);
    const passoX = Math.round(claro.largura * (1 + grade.espacoX));
    const passoY = Math.round(claro.altura * (1 + grade.espacoY) * 0.5) * 2;
    const tile = vazio(passoX, passoY);
    colar(tile, claro, 0, 0, true);
    colar(tile, escuro, Math.round(passoX / 2), passoY / 2, true);
    return tile;
  });
}

/**
 * Grade de texto já desenhada e inclinada, por tamanho de foto, modelo e inclinação. Um pouco
 * maior que a foto (folgaDaGrade): cada foto recorta a sua janela com um deslocamento próprio.
 * As fotos de um evento quase sempre têm as mesmas medidas (a mesma câmera, em pé ou deitada):
 * cada grade é desenhada uma vez e reaproveitada. Poucas entradas (a da prévia tem ~2,5 MB em
 * pixels crus), as mais antigas saem.
 */
const grades = new Map<string, Promise<Pixels>>();
const MAXIMO_DE_GRADES = 16;

function folgaDaGrade(largura: number, altura: number) {
  return Math.max(16, Math.round(Math.min(largura, altura) * 0.25));
}

function gradeDeTexto(largura: number, altura: number, modelo: ModeloMarca, variacao: number) {
  return lembrarComLimite(
    grades,
    MAXIMO_DE_GRADES,
    `${modelo}:${largura}x${altura}:${variacao}`,
    () => desenharGrade(largura, altura, modelo, variacao),
  );
}

async function desenharGrade(
  largura: number,
  altura: number,
  modelo: ModeloMarca,
  variacao: number,
): Promise<Pixels> {
  const escala = Math.max(largura, altura) / LADO_DE_REFERENCIA;
  const folga = folgaDaGrade(largura, altura);
  const [w, h] = [largura + folga, altura + folga];
  const larguraTexto = Math.max(24, Math.round(ESTILOS[modelo].grade.texto * escala));
  const tile = await ladrilho(larguraTexto, modelo, escala);
  // Preenche um quadrado que cobre a área mesmo depois de girado e recorta o centro.
  const lado = Math.ceil(Math.hypot(w, h)) + tile.largura;
  const preenchido = await sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: tile.pixels,
        raw: { width: tile.largura, height: tile.altura, channels: 4 },
        tile: true,
      },
    ])
    .raw()
    .toBuffer();
  const girado = await sharp(preenchido, { raw: { width: lado, height: lado, channels: 4 } })
    .rotate(INCLINACOES_DA_GRADE[variacao], { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = await sharp(girado.data, {
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
  return { pixels, largura: w, altura: h };
}

// ---------------------------------------------------------------- 2. Linhas e faixas

const n = (v: number) => v.toFixed(1);

/**
 * Linhas finas em dois ângulos e faixas largas com hachura, em SVG (só formas: não depende de
 * fonte), desenhadas por foto: vãos, espessuras, opacidades, ângulos e posição das faixas saem
 * da semente da foto. As medidas são proporcionais ao lado maior, então a prévia e a miniatura
 * da mesma foto têm o mesmo desenho.
 */
function svgDaFoto(largura: number, altura: number, estilo: Estilo, semente: number) {
  const sorteio = sorteador(semente);
  const escala = Math.max(largura, altura) / LADO_DE_REFERENCIA;
  const menor = Math.min(largura, altura);
  const [cx, cy] = [largura / 2, altura / 2];
  const meia = Math.hypot(largura, altura) / 2 + 4;
  const defs: string[] = [];
  const formas: string[] = [];

  for (let f = 0; f < estilo.faixas.quantas; f++) {
    const angulo = -75 + sorteio() * 150;
    const larguraFaixa = menor * (0.07 + sorteio() * 0.06);
    const centro = (sorteio() - 0.5) * menor * 0.95;
    const clara = sorteio() < 0.5;
    const [cor, oposta] = clara ? ["#fff", "#000"] : ["#000", "#fff"];
    const op = estilo.faixas.opacidade * (0.9 + sorteio() * 0.2);
    const passo = (6 + sorteio() * 4) * escala;
    const giro = 30 + sorteio() * 120;
    defs.push(
      `<pattern id="h${f}" width="${n(passo)}" height="${n(passo)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${n(giro)})">` +
        `<rect width="${n(passo * 0.38)}" height="${n(passo)}" fill="${oposta}"/>` +
        `<circle cx="${n(passo * 0.7)}" cy="${n(passo * 0.5)}" r="${n(passo * 0.12)}" fill="${cor}"/></pattern>`,
    );
    const y = centro - larguraFaixa / 2;
    const borda = Math.max(0.8, 1.3 * escala);
    formas.push(
      `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(angulo)})">` +
        `<rect x="${n(-meia)}" y="${n(y)}" width="${n(meia * 2)}" height="${n(larguraFaixa)}" fill="${cor}" fill-opacity="${op.toFixed(3)}"/>` +
        `<rect x="${n(-meia)}" y="${n(y)}" width="${n(meia * 2)}" height="${n(larguraFaixa)}" fill="url(#h${f})" fill-opacity="${(op * 0.9).toFixed(3)}"/>` +
        `<path d="M${n(-meia)},${n(y)}H${n(meia)}M${n(-meia)},${n(y + larguraFaixa)}H${n(meia)}" stroke="${oposta}" stroke-opacity="${Math.min(0.4, op * 1.6).toFixed(3)}" stroke-width="${n(borda)}"/></g>`,
    );
  }

  for (const base of ANGULOS_DAS_LINHAS) {
    const rad = ((base + (sorteio() - 0.5) * 16) * Math.PI) / 180;
    const [dx, dy] = [Math.cos(rad), Math.sin(rad)];
    const [nx, ny] = [-dy, dx];
    const passoMedio = estilo.linhas.passo * escala;
    let clara = sorteio() < 0.5;
    for (let c = -meia + sorteio() * passoMedio; c < meia;) {
      const opacidade = Math.min(0.4, estilo.linhas.opacidade * (0.8 + sorteio() * 0.35));
      const espessura = Math.max(0.5, (0.6 + sorteio() * 1.6) * escala);
      const [px, py] = [cx + nx * c, cy + ny * c];
      formas.push(
        `<path d="M${n(px - dx * meia)},${n(py - dy * meia)}L${n(px + dx * meia)},${n(py + dy * meia)}" stroke="${clara ? "#fff" : "#000"}" stroke-opacity="${opacidade.toFixed(3)}" stroke-width="${espessura.toFixed(2)}"/>`,
      );
      // Claras e escuras alternadas, com uma troca fora de hora de vez em quando.
      clara = sorteio() < 0.8 ? !clara : clara;
      c += passoMedio * (0.75 + sorteio() * 0.5);
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" fill="none"><defs>${defs.join("")}</defs>${formas.join("")}</svg>`,
  );
}

// ---------------------------------------------------------------- 3. Marca principal

/**
 * "ClicouAí" grande com "PRÉVIA · NÃO AUTORIZADA" embaixo: preenchimento claro e contorno escuro,
 * sem rotação. Por largura do "ClicouAí" (múltiplos de 8 px) e opacidade.
 */
const principais = new Map<string, Promise<Pixels>>();
const MAXIMO_DE_PRINCIPAIS = 24;

function marcaPrincipal(larguraNome: number, opacidade: number) {
  const largura = Math.max(48, Math.round(larguraNome / 8) * 8);
  return lembrarComLimite(principais, MAXIMO_DE_PRINCIPAIS, `${largura}:${opacidade}`, async () => {
    const [nome, aviso] = await Promise.all([
      letreiro(CAMINHO_NOME, largura, {
        clara: true,
        opacidade,
        opacidadeContorno: opacidade,
        espessura: Math.max(1, largura / 110),
      }),
      letreiro(CAMINHO_AVISO, largura * 0.86, {
        clara: true,
        opacidade,
        opacidadeContorno: opacidade,
        espessura: Math.max(1, largura / 190),
      }),
    ]);
    const vao = Math.round(nome.altura * 0.02);
    const marca = vazio(Math.max(nome.largura, aviso.largura), nome.altura + vao + aviso.altura);
    colar(marca, nome, Math.round((marca.largura - nome.largura) / 2), 0);
    colar(marca, aviso, Math.round((marca.largura - aviso.largura) / 2), nome.altura + vao);
    return marca;
  });
}

/** Uma marca a gravar: centro e largura do "ClicouAí" em frações da foto, e rotação. */
type MarcaNaFoto = { cx: number; cy: number; largura: number; rotacao: number };

/** Plano da marca de uma foto, em frações (vale igual para a prévia e para a miniatura). */
type Plano = {
  variacao: number;
  dx: number;
  dy: number;
  semente: number;
  marcas: MarcaNaFoto[];
};

const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function caixaValida(c: CaixaDoRosto | null | undefined): c is CaixaDoRosto {
  return (
    !!c &&
    [c.esquerda, c.topo, c.largura, c.altura].every(Number.isFinite) &&
    c.largura > 0 &&
    c.altura > 0
  );
}

/**
 * Onde vão as marcas desta foto. Sem rostos: a principal no centro, um pouco acima do meio.
 * Com rostos (em frações, como o Rekognition devolve, na foto já girada pelo EXIF): a principal
 * sobre o MAIOR rosto e o começo do tronco, e uma marca menor sobre cada outro rosto grande
 * (pelo menos 40% da largura do maior e 5% da largura da foto) que a principal não cobre.
 */
function planoDaFoto(
  semente: string,
  modelo: ModeloMarca,
  proporcao: number,
  caixas: readonly (CaixaDoRosto | null)[],
): Plano {
  const sorteio = sorteador(hashDoTexto(semente));
  const estilo = ESTILOS[modelo];
  const plano: Plano = {
    variacao: Math.floor(sorteio() * INCLINACOES_DA_GRADE.length),
    dx: sorteio(),
    dy: sorteio(),
    semente: hashDoTexto(`${semente}:linhas`),
    marcas: [],
  };
  const largura = estilo.centro.largura * (0.96 + sorteio() * 0.08);
  const rotacao = () => (sorteio() * 2 - 1) * ROTACAO_MAXIMA;
  // `proporcao` = largura / altura: as alturas em fração da largura e vice-versa.
  const rostos = caixas
    .filter(caixaValida)
    .map((c) => ({
      cx: entre(c.esquerda + c.largura / 2, 0, 1),
      cy: entre(c.topo + c.altura / 2, 0, 1),
      largura: entre(c.largura, 0, 1),
      altura: entre(c.altura, 0, 1),
    }))
    .sort((a, b) => b.largura * b.altura - a.largura * a.altura);

  if (rostos.length === 0) {
    plano.marcas.push({
      cx: 0.5 + (sorteio() - 0.5) * 0.06,
      cy: 0.44 + (sorteio() - 0.5) * 0.06,
      largura,
      rotacao: rotacao(),
    });
    return plano;
  }

  const [maior, ...outros] = rostos;
  const principal: MarcaNaFoto = {
    cx: maior.cx,
    // Um pouco abaixo do centro do rosto: cobre o rosto e o começo do tronco.
    cy: maior.cy + maior.altura * 0.3,
    largura: entre(Math.max(largura, maior.largura * 2.4), 0.3, 0.92),
    rotacao: rotacao(),
  };
  plano.marcas.push(principal);
  // Altura aproximada da marca principal, em fração da altura da foto (o desenho tem ~1:4,6).
  const alturaPrincipal = (principal.largura / 4.6) * proporcao;
  for (const r of outros) {
    if (plano.marcas.length > MARCAS_EXTRAS) break;
    if (r.largura < Math.max(0.05, maior.largura * 0.4)) continue;
    const coberto =
      Math.abs(r.cx - principal.cx) < principal.largura * 0.4 &&
      Math.abs(r.cy - principal.cy) < alturaPrincipal * 0.5;
    if (coberto) continue;
    plano.marcas.push({
      cx: r.cx,
      cy: r.cy + r.altura * 0.2,
      largura: entre(r.largura * 2.6, 0.2, 0.45),
      rotacao: rotacao(),
    });
  }
  return plano;
}

/**
 * Posição de uma marca de `w`×`h` centrada em (cx, cy): puxada para dentro da foto quando
 * possível, mas sem sair mais de 30% do lugar (o rosto continua coberto); o que ainda passar da
 * borda é cortado.
 */
async function posicionar(marca: Pixels, cx: number, cy: number, W: number, H: number) {
  const ajustar = (c: number, tam: number, limite: number) => {
    const dentro = tam <= limite ? entre(c, tam / 2, limite - tam / 2) : limite / 2;
    return entre(dentro, c - tam * 0.3, c + tam * 0.3);
  };
  const left = Math.round(ajustar(cx, marca.largura, W) - marca.largura / 2);
  const top = Math.round(ajustar(cy, marca.altura, H) - marca.altura / 2);
  const [x0, y0] = [Math.max(0, left), Math.max(0, top)];
  const [x1, y1] = [Math.min(W, left + marca.largura), Math.min(H, top + marca.altura)];
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const raw = { width: x1 - x0, height: y1 - y0, channels: 4 as const };
  if (x0 === left && y0 === top && raw.width === marca.largura && raw.height === marca.altura) {
    return { input: marca.pixels, raw, left, top };
  }
  const input = await sharp(marca.pixels, {
    raw: { width: marca.largura, height: marca.altura, channels: 4 },
  })
    .extract({ left: x0 - left, top: y0 - top, width: raw.width, height: raw.height })
    .raw()
    .toBuffer();
  return { input, raw, left: x0, top: y0 };
}

/** A marca principal (ou uma menor) pronta para esta foto: no tamanho e girada. */
async function marcaGirada(m: MarcaNaFoto, W: number, opacidade: number): Promise<Pixels> {
  const larguraNome = Math.max(16, Math.round(m.largura * W));
  const pedida = Math.max(larguraNome, Math.round(W * 0.4));
  let marca = await marcaPrincipal(pedida, opacidade);
  // As menores saem da principal reduzida (sem desenhar o texto de novo).
  if (larguraNome < pedida - 8) {
    const { data, info } = await sharp(marca.pixels, {
      raw: { width: marca.largura, height: marca.altura, channels: 4 },
    })
      .resize({ width: Math.max(16, Math.round((marca.largura * larguraNome) / pedida)) })
      .raw()
      .toBuffer({ resolveWithObject: true });
    marca = { pixels: data, largura: info.width, altura: info.height };
  }
  const { data, info } = await sharp(marca.pixels, {
    raw: { width: marca.largura, height: marca.altura, channels: 4 },
  })
    .rotate(m.rotacao, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, largura: info.width, altura: info.height };
}

// ---------------------------------------------------------------- Versões

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
  qualidade: number,
  modelo: ModeloMarca,
  plano: Plano,
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
  const estilo = ESTILOS[modelo];
  const folga = folgaDaGrade(largura, altura);
  const [grade, marcas] = await Promise.all([
    gradeDeTexto(largura, altura, modelo, plano.variacao),
    Promise.all(plano.marcas.map((m) => marcaGirada(m, largura, estilo.centro.opacidade))),
  ]);
  // A janela desta foto na grade (deslocamento próprio).
  const janela = await sharp(grade.pixels, {
    raw: { width: grade.largura, height: grade.altura, channels: 4 },
  })
    .extract({
      left: Math.min(folga, Math.floor(plano.dx * folga)),
      top: Math.min(folga, Math.floor(plano.dy * folga)),
      width: largura,
      height: altura,
    })
    .raw()
    .toBuffer();
  const sobreposicoes = await Promise.all(
    marcas.map((m, i) =>
      posicionar(m, plano.marcas[i].cx * largura, plano.marcas[i].cy * altura, largura, altura),
    ),
  );
  const buffer = await sharp(data, {
    raw: { width: largura, height: altura, channels: info.channels },
  })
    .composite([
      { input: janela, raw: { width: largura, height: altura, channels: 4 } },
      { input: svgDaFoto(largura, altura, estilo, plano.semente) },
      ...sobreposicoes.filter((s) => s !== null),
    ])
    // effort 2 (de 0 a 6): bem mais rápido que o padrão (4), com arquivo quase do mesmo tamanho.
    .webp({ quality: qualidade, effort: 2 })
    .toBuffer();
  return { buffer, largura, altura };
}

/** Rostos da foto (tabela `rostos`), em frações da foto já girada pelo EXIF. */
export type RostosDaFoto = readonly (CaixaDoRosto | null)[];

async function previaEMiniatura(
  base: Base,
  modelo: ModeloMarca,
  semente: string,
  rostos: RostosDaFoto,
) {
  const plano = planoDaFoto(semente, modelo, base.largura / base.altura, rostos);
  const [previa, miniatura] = await Promise.all([
    versao(base, LARGURA_PREVIA, QUALIDADE_PREVIA, modelo, plano),
    versao(base, LARGURA_MINIATURA, QUALIDADE_MINIATURA, modelo, plano),
  ]);
  return { previa, miniatura };
}

export type VersoesDaFoto = {
  previa: ImagemGerada;
  miniatura: ImagemGerada;
  /** JPEG reduzido e já girado para o reconhecimento facial. Nunca vai ao bucket público. */
  paraRostos: () => Promise<Buffer>;
  /**
   * Prévia e miniatura de novo, da mesma base (sem ler o original outra vez), com a marca sobre
   * os rostos encontrados depois (cadastro dos rostos, no fim do envio).
   */
  comRostos: (rostos: RostosDaFoto) => Promise<{ previa: ImagemGerada; miniatura: ImagemGerada }>;
};

/**
 * Prévia e miniatura, as duas com marca d'água (no modelo escolhido pelo dono do evento), a
 * partir de uma decodificação só do original. A cópia para o reconhecimento facial sai da mesma
 * base, só quando pedida. `semente` (o id da foto) varia o desenho da marca; `rostos`, quando
 * já conhecidos, põem a marca principal sobre o maior rosto.
 */
export async function gerarVersoes(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  semente = "",
  rostos: RostosDaFoto = [],
): Promise<VersoesDaFoto> {
  const base = await decodificar(original, LARGURA_ROSTOS);
  const { previa, miniatura } = await previaEMiniatura(base, modelo, semente, rostos);
  return {
    previa,
    miniatura,
    paraRostos: () => daBase(base).jpeg({ quality: 85 }).toBuffer(),
    comRostos: (novos) => previaEMiniatura(base, modelo, semente, novos),
  };
}

/** Prévia com marca d'água para a página da foto (LARGURA_PREVIA no lado maior). */
export async function gerarPrevia(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  semente = "",
  rostos: RostosDaFoto = [],
): Promise<ImagemGerada> {
  const base = await decodificar(original, LARGURA_PREVIA);
  const plano = planoDaFoto(semente, modelo, base.largura / base.altura, rostos);
  return versao(base, LARGURA_PREVIA, QUALIDADE_PREVIA, modelo, plano);
}

/** Miniatura com marca d'água para a grade da galeria (LARGURA_MINIATURA no lado maior). */
export async function gerarMiniatura(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  semente = "",
  rostos: RostosDaFoto = [],
): Promise<ImagemGerada> {
  const base = await decodificar(original, LARGURA_MINIATURA);
  const plano = planoDaFoto(semente, modelo, base.largura / base.altura, rostos);
  return versao(base, LARGURA_MINIATURA, QUALIDADE_MINIATURA, modelo, plano);
}

/**
 * Amostra de um modelo de marca d'água numa foto de exemplo, para a escolha no painel. Sai do
 * mesmo código das prévias de verdade (o que o fotógrafo vê é o que o cliente vai ver).
 */
export async function amostraDaMarca(modelo: ModeloMarca): Promise<Buffer> {
  const foto = await readFile(path.join(process.cwd(), "public", "inicio", "ensaio-casal.webp"));
  const base = await decodificar(foto, LARGURA_PREVIA);
  const plano = planoDaFoto("amostra", modelo, base.largura / base.altura, []);
  return (await versao(base, LARGURA_PREVIA, 78, modelo, plano)).buffer;
}

/** Cópia reduzida e já girada para o reconhecimento facial (JPEG, até LARGURA_ROSTOS). */
export async function copiaParaRostos(original: Buffer): Promise<Buffer> {
  return daBase(await decodificar(original, LARGURA_ROSTOS))
    .jpeg({ quality: 85 })
    .toBuffer();
}
