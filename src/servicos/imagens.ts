import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp, { type OverlayOptions } from "sharp";

import { LIMITE_PIXELS } from "@/lib/limites-envio";
import { MODELO_MARCA_PADRAO, type ModeloMarca } from "@/lib/marca-dagua";
import {
  ESTILOS_DOS_MODELOS,
  planejarMarcas,
  planejarTrama,
  type Marca,
  type PlanoDaMarca,
  type PlanoDaTrama,
  type TipoDeVersao,
} from "@/lib/marca-distribuida";
import { CONFIG_MARCA_PADRAO, type ConfigMarca } from "@/lib/protecao-previas";

// Gera as versões públicas de uma foto (docs/arquitetura.md, "Armazenamento").
// A marca d'água é gravada nos pixels: quem salva a prévia, ou tira print dela, leva a marca
// junto. Junto com a baixa resolução, é a proteção real do original (docs/riscos.md).
// Usada no processamento de cada foto enviada (src/servicos/envios.ts), na regeração
// (src/servicos/regerar-previas.ts), nos vídeos (src/servicos/video.ts) e nos dados de exemplo.
//
// O desenho (onde vai cada logo) sai de src/lib/marca-distribuida.ts: trama fina cobrindo a foto
// inteira (microlográficas e linhas onduladas), grade espalhada de logos com variação por foto,
// logo grande no centro e outra cruzada no terço de cima. Os parâmetros vêm da
// configuração global do gestor (src/lib/protecao-previas.ts) e do modelo do fotógrafo.
//
// Desempenho (uma foto de 24 MP por vez numa função de 1 vCPU): o original é decodificado uma
// vez só, já reduzido; as versões saem dessa base em pixels crus (sem PNG no meio). Como cada
// foto tem um desenho próprio, a camada de marcas é montada por foto: cada logo é uma
// "figurinha" pequena (a silhueta da logo girada) colada na posição dela.
//
// Formatos: JPEG, PNG, WebP, TIFF e AVIF (src/lib/tipos-imagem.ts). Arquivos grandes não estouram
// a memória: a leitura é sequencial e a redução acontece durante a decodificação (no JPEG e no
// WebP, o decodificador já lê em 1/2, 1/4 ou 1/8; nos outros, linha a linha, sem guardar a
// imagem inteira). Medido com 1 thread: JPEG de 100 MP em ~0,6 s e ~140 MB de memória; TIFF de
// 16 bits de 60 MP (260 MB) em ~1,4 s e ~430 MB, quase todo o arquivo em si.

/** Lado maior da prévia no padrão (o gestor muda em /admin/marca-dagua, até LARGURA_ROSTOS). */
export const LARGURA_PREVIA = CONFIG_MARCA_PADRAO.larguraPrevia;
/**
 * Prévia do celular: na tela do telefone fica igual, e uma cópia "limpa" por IA a partir dela
 * sai pequena demais para imprimir (docs/riscos.md, "Marca d'água removida com ferramentas de IA").
 */
export const LARGURA_PREVIA_CELULAR = 1000;
export const LARGURA_MINIATURA = 400;
/** Lado maior da cópia que vai ao reconhecimento facial (o Rekognition aceita até 5 MB). */
export const LARGURA_ROSTOS = 1920;
/** Qualidade máxima do WebP da prévia do celular e da miniatura. */
const QUALIDADE_MAXIMA_PEQUENAS = 70;

/** Desenho da logo usado como carimbo (vai no bundle das funções por outputFileTracingIncludes). */
const CAMINHO_LOGO = path.join(process.cwd(), "public", "logo.png");
/**
 * Textos do modelo "Proteção forte", já em PNG (scripts/gerar-textos-da-marca.ts): o servidor
 * não tem fontes para desenhar texto.
 */
const CAMINHO_FOTO_PROTEGIDA = path.join(process.cwd(), "public", "marca", "foto-protegida.png");
const CAMINHO_NAO_TIRE_PRINT = path.join(process.cwd(), "public", "marca", "nao-tire-print.png");
/** Cores da marca (src/app/globals.css: --primary e --highlight). */
const AZUL_DA_MARCA = "#315cff";
const LIMAO_DA_MARCA = "#b8ff32";
/** Opacidade da sombra escura em relação à da logo branca (marca visível em foto clara e escura). */
const SOMBRA_RELATIVA = 0.45;

export type ImagemGerada = {
  buffer: Buffer;
  largura: number;
  altura: number;
};

/**
 * De onde sai o desenho da marca de uma foto: o id dela (semente da variação) e a configuração
 * global em vigor. Sem a configuração, os padrões.
 */
export type OpcoesDaMarca = { semente: string; config?: ConfigMarca };

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

const textos = new Map<string, Promise<Buffer>>();
function carregarTexto(caminho: string) {
  return lembrar(textos, caminho, () => readFile(caminho));
}

type Alfa = { data: Buffer; largura: number; altura: number };

/**
 * A transparência da logo numa largura (só o canal alfa). A largura é arredondada em degraus de
 * 3% (a diferença não se vê), então poucas larguras atendem todas as fotos e ficam em memória
 * (as menos usadas saem).
 */
const alfas = new Map<string, Promise<Alfa>>();
const MAXIMO_DE_ALFAS = 128;
const DEGRAU_DA_LARGURA = Math.log(1.03);
function alfaDaLogo(largura: number): Promise<Alfa> {
  const degrau = Math.round(Math.log(Math.max(8, largura)) / DEGRAU_DA_LARGURA);
  const chave = String(Math.round(Math.exp(degrau * DEGRAU_DA_LARGURA)));
  const existente = alfas.get(chave);
  if (existente) {
    // Usada agora: vai para o fim da fila de descarte.
    alfas.delete(chave);
    alfas.set(chave, existente);
    return existente;
  }
  if (alfas.size >= MAXIMO_DE_ALFAS) alfas.delete(alfas.keys().next().value!);
  return lembrar(alfas, chave, async () => {
    const { data, info } = await sharp(await carregarLogo())
      .resize({ width: Number(chave) })
      .ensureAlpha()
      .extractChannel("alpha")
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, largura: info.width, altura: info.height };
  });
}

/**
 * O alfa girado em torno do centro, com interpolação bilinear, num quadro que cabe a logo
 * inteira. Em JavaScript puro: para figurinhas deste tamanho, mais barato que uma ida ao libvips.
 */
function girar(alfa: Alfa, graus: number): Alfa {
  if (Math.abs(graus) < 0.5) return alfa;
  const rad = (graus * Math.PI) / 180;
  const [cos, sen] = [Math.cos(rad), Math.sin(rad)];
  const largura = Math.ceil(Math.abs(alfa.largura * cos) + Math.abs(alfa.altura * sen)) + 2;
  const altura = Math.ceil(Math.abs(alfa.largura * sen) + Math.abs(alfa.altura * cos)) + 2;
  const data = Buffer.alloc(largura * altura);
  const [cxo, cyo] = [alfa.largura / 2, alfa.altura / 2];
  const [cxd, cyd] = [largura / 2, altura / 2];
  const { data: origem, largura: lo, altura: ao } = alfa;
  for (let y = 0; y < altura; y++) {
    const dy = y + 0.5 - cyd;
    for (let x = 0; x < largura; x++) {
      const dx = x + 0.5 - cxd;
      // Ponto de origem (giro inverso).
      const sx = dx * cos + dy * sen + cxo - 0.5;
      const sy = -dx * sen + dy * cos + cyo - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < -1 || y0 < -1 || x0 >= lo || y0 >= ao) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      // Os quatro vizinhos (fora da logo = transparente). Sem função auxiliar dentro do laço:
      // este laço roda centenas de milhares de vezes por foto.
      const dentroX0 = x0 >= 0;
      const dentroX1 = x0 + 1 < lo;
      const dentroY0 = y0 >= 0;
      const dentroY1 = y0 + 1 < ao;
      const i0 = y0 * lo + x0;
      const a00 = dentroX0 && dentroY0 ? origem[i0] : 0;
      const a10 = dentroX1 && dentroY0 ? origem[i0 + 1] : 0;
      const a01 = dentroX0 && dentroY1 ? origem[i0 + lo] : 0;
      const a11 = dentroX1 && dentroY1 ? origem[i0 + lo + 1] : 0;
      const v = (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy;
      if (v > 0.5) data[y * largura + x] = Math.round(v);
    }
  }
  return { data, largura, altura };
}

type Figurinha = { data: Buffer; largura: number; altura: number };

/**
 * Uma logo pronta para colar: branca, com a sombra escura deslocada por baixo, na opacidade e no
 * giro da marca, em pixels crus RGBA (fundo transparente).
 */
async function figurinha(marca: Marca): Promise<Figurinha> {
  const alfa = girar(await alfaDaLogo(marca.largura), marca.angulo);
  const d = Math.max(1, Math.round(marca.largura / 140));
  const largura = alfa.largura + d;
  const altura = alfa.altura + d;
  const px = Buffer.alloc(largura * altura * 4);
  const sombra = marca.opacidade * SOMBRA_RELATIVA;
  // Sombra (preta) deslocada e, por cima, a logo branca ("over" com alfa não pré-multiplicado).
  for (let y = 0; y < alfa.altura; y++) {
    for (let x = 0; x < alfa.largura; x++) {
      const a = alfa.data[y * alfa.largura + x];
      if (a) px[((y + d) * largura + x + d) * 4 + 3] = Math.round(a * sombra);
    }
  }
  for (let y = 0; y < alfa.altura; y++) {
    for (let x = 0; x < alfa.largura; x++) {
      const a = (alfa.data[y * alfa.largura + x] / 255) * marca.opacidade;
      if (!a) continue;
      const i = (y * largura + x) * 4;
      const embaixo = px[i + 3] / 255;
      const total = a + embaixo * (1 - a);
      const cor = Math.round((255 * a) / total);
      px[i] = px[i + 1] = px[i + 2] = cor;
      px[i + 3] = Math.round(total * 255);
    }
  }
  return { data: px, largura, altura };
}

/**
 * A figurinha na posição da marca. O Sharp aceita a figurinha passando da borda, mas não maior
 * que a foto: nesse caso (logo central numa foto estreita), só o pedaço que cai na foto.
 */
async function colar(
  f: Figurinha,
  marca: Marca,
  largura: number,
  altura: number,
): Promise<OverlayOptions | null> {
  let left = Math.round(marca.x - f.largura / 2);
  let top = Math.round(marca.y - f.altura / 2);
  let { data, largura: w, altura: h } = f;
  if (w > largura || h > altura) {
    const x0 = Math.max(0, -left);
    const y0 = Math.max(0, -top);
    const x1 = Math.min(w, largura - left);
    const y1 = Math.min(h, altura - top);
    if (x1 <= x0 || y1 <= y0) return null;
    data = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
      .raw()
      .toBuffer();
    [w, h, left, top] = [x1 - x0, y1 - y0, left + x0, top + y0];
  }
  return { input: data, raw: { width: w, height: h, channels: 4 }, left, top };
}

/**
 * A microlográfica da trama já girada (só o alfa). O giro é arredondado a 1 grau e as poucas
 * combinações de largura e giro ficam em memória (as menos usadas saem).
 */
const microsGiradas = new Map<string, Promise<Alfa>>();
const MAXIMO_DE_MICROS = 256;
function microGirada(largura: number, graus: number): Promise<Alfa> {
  const giro = Math.round(graus);
  const chave = `${Math.round(largura)}:${giro}`;
  const existente = microsGiradas.get(chave);
  if (existente) return existente;
  if (microsGiradas.size >= MAXIMO_DE_MICROS) {
    microsGiradas.delete(microsGiradas.keys().next().value!);
  }
  return lembrar(microsGiradas, chave, async () => girar(await alfaDaLogo(largura), giro));
}

/**
 * As microlográficas da trama (src/lib/marca-distribuida.ts, planejarTrama) numa camada do
 * tamanho da foto, em pixels crus RGBA: primeiro a cópia escura (deslocada), depois a clara, no
 * modo "over". Em JavaScript direto, sem SVG: são centenas de logos pequenas por versão.
 */
async function camadaDasMicros(largura: number, altura: number, trama: PlanoDaTrama) {
  const px = Buffer.alloc(largura * altura * 4);
  const giradas = await Promise.all(
    trama.micros.map((m) => microGirada(trama.larguraMicro, m.angulo)),
  );
  const pintar = (cor: number, opacidade: number, desloca: number) => {
    trama.micros.forEach((m, k) => {
      const alfa = giradas[k];
      const x0 = Math.round(m.x - alfa.largura / 2) + desloca;
      const y0 = Math.round(m.y - alfa.altura / 2) + desloca;
      for (let y = Math.max(0, -y0); y < alfa.altura && y0 + y < altura; y++) {
        for (let x = Math.max(0, -x0); x < alfa.largura && x0 + x < largura; x++) {
          const a = (alfa.data[y * alfa.largura + x] / 255) * opacidade;
          if (a <= 0) continue;
          const i = ((y0 + y) * largura + x0 + x) * 4;
          const embaixo = px[i + 3] / 255;
          const total = a + embaixo * (1 - a);
          const c = (cor * a + px[i] * embaixo * (1 - a)) / total;
          px[i] = px[i + 1] = px[i + 2] = Math.round(c);
          px[i + 3] = Math.round(total * 255);
        }
      }
    });
  };
  pintar(0, trama.opacidadeMicro * trama.escuraRelativa, trama.deslocamento);
  pintar(255, trama.opacidadeMicro, 0);
  return px;
}

/** As linhas onduladas da trama em SVG do tamanho da foto: a escura (deslocada) e a clara. */
function svgDasLinhas(largura: number, altura: number, trama: PlanoDaTrama) {
  const caminho = trama.linhas
    .map((l) => "M" + l.pontos.map(([x, y]) => `${x},${y}`).join("L"))
    .join("");
  const d = trama.deslocamento;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">` +
      `<path d="${caminho}" stroke="#000" stroke-opacity="${(trama.opacidadeLinhas * trama.escuraRelativa).toFixed(3)}" stroke-width="${trama.espessura}" transform="translate(${d},${d})" fill="none"/>` +
      `<path d="${caminho}" stroke="#fff" stroke-opacity="${trama.opacidadeLinhas.toFixed(3)}" stroke-width="${trama.espessura}" fill="none"/>` +
      `</svg>`,
  );
}

/** A trama inteira: as linhas e, por cima, as microlográficas. */
async function trama(largura: number, altura: number, plano: PlanoDaTrama) {
  return [
    { input: svgDasLinhas(largura, altura, plano) },
    {
      input: await camadaDasMicros(largura, altura, plano),
      raw: { width: largura, height: altura, channels: 4 as const },
    },
  ] satisfies OverlayOptions[];
}

/**
 * Linhas finas cruzadas na diagonal (as duas direções), claras com uma sombra escura do lado,
 * em SVG do tamanho da foto, deslocadas pela fase da foto. Só linhas: não depende de fonte.
 */
function svgDaGrade(largura: number, altura: number, passo: number, opacidade: number, fase = 0) {
  const espessura = Math.max(1, Math.round(largura / 600));
  const linhas: string[] = [];
  for (let x = -altura - passo + Math.round(fase * passo); x < largura + altura; x += passo) {
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

/**
 * Anéis grandes na cor da marca, com dois pontos em limão, em SVG do tamanho da foto: o maior
 * cobre o centro (onde costuma estar a pessoa) e os outros encostam nas bordas. Posições em
 * fração da foto; raio em fração do lado menor.
 */
function svgDosAneis(largura: number, altura: number) {
  const menor = Math.min(largura, altura);
  const espessura = Math.max(4, Math.round(menor * 0.05));
  const aneis = [
    [0.5, 0.48, 0.21],
    [0.1, 0.12, 0.16],
    [0.92, 0.84, 0.18],
    [0.9, 0.16, 0.09],
    [0.12, 0.86, 0.1],
  ];
  const pontos = [
    [0.66, 0.33, 0.035],
    [0.3, 0.68, 0.028],
  ];
  const circulo = ([x, y, r]: number[], resto: string) =>
    `<circle cx="${Math.round(x * largura)}" cy="${Math.round(y * altura)}" r="${Math.round(r * menor)}" ${resto}/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">` +
      aneis
        .map((a) =>
          circulo(
            a,
            `fill="none" stroke="${AZUL_DA_MARCA}" stroke-opacity="0.5" stroke-width="${espessura}"`,
          ),
        )
        .join("") +
      pontos.map((p) => circulo(p, `fill="${LIMAO_DA_MARCA}" fill-opacity="0.55"`)).join("") +
      `</svg>`,
  );
}

/**
 * Os avisos do modelo "Proteção forte": "Foto protegida" na vertical, nas duas laterais, e
 * "Não tire print" numa caixa abaixo do centro. Tamanhos em proporção à foto.
 */
async function avisosDeProtecao(largura: number, altura: number): Promise<OverlayOptions[]> {
  const menor = Math.min(largura, altura);
  const [protegida, print] = await Promise.all([
    carregarTexto(CAMINHO_FOTO_PROTEGIDA),
    carregarTexto(CAMINHO_NAO_TIRE_PRINT),
  ]);
  // "Foto protegida": altura do texto ~4% do lado menor, sem passar de 60% da altura da foto.
  const alturaTexto = Math.max(10, Math.round(menor * 0.04));
  const lateral = await sharp(protegida).resize({ height: alturaTexto }).png().toBuffer();
  const { width: comprimento = 0 } = await sharp(lateral).metadata();
  const encaixe =
    comprimento > altura * 0.6
      ? await sharp(lateral)
          .resize({ width: Math.round(altura * 0.6) })
          .png()
          .toBuffer()
      : lateral;
  const [esquerda, direita] = await Promise.all([
    sharp(encaixe).rotate(270).png().toBuffer({ resolveWithObject: true }),
    sharp(encaixe).rotate(90).png().toBuffer({ resolveWithObject: true }),
  ]);
  const margem = Math.round(menor * 0.035);
  // "Não tire print": até 42% da largura, a 72% da altura.
  const caixa = await sharp(print)
    .resize({ width: Math.max(40, Math.round(largura * 0.42)) })
    .png()
    .toBuffer({ resolveWithObject: true });
  return [
    {
      input: esquerda.data,
      left: margem,
      top: Math.round((altura - esquerda.info.height) / 2),
    },
    {
      input: direita.data,
      left: largura - margem - direita.info.width,
      top: Math.round((altura - direita.info.height) / 2),
    },
    {
      input: caixa.data,
      left: Math.round((largura - caixa.info.width) / 2),
      top: Math.min(altura - caixa.info.height, Math.round(altura * 0.72)),
    },
  ];
}

/**
 * Tudo o que vai por cima da foto, de baixo para cima: trama, grade de logos, anéis, linhas, logo
 * do centro e a do terço de cima, avisos. Colado direto na foto (sem uma camada inteira no meio).
 */
async function sobreposicoes(
  largura: number,
  altura: number,
  plano: PlanoDaMarca,
  planoDaTrama: PlanoDaTrama,
  modelo: ModeloMarca,
): Promise<OverlayOptions[]> {
  const estilo = ESTILOS_DOS_MODELOS[modelo];
  const coladas = await Promise.all(
    plano.marcas.map(async (m) => ({
      papel: m.papel,
      overlay: await colar(await figurinha(m), m, largura, altura),
    })),
  );
  const daMarca = (papeis: Marca["papel"][]) =>
    coladas.flatMap((c) => (c.overlay && papeis.includes(c.papel) ? [c.overlay] : []));

  const sobre: OverlayOptions[] = [
    ...(await trama(largura, altura, planoDaTrama)),
    ...daMarca(["grade"]),
  ];
  if (estilo.protecao) sobre.push({ input: svgDosAneis(largura, altura) });
  if (estilo.grade) {
    const passo = Math.max(24, Math.round(largura * estilo.grade.passo));
    sobre.push({
      input: svgDaGrade(largura, altura, passo, estilo.grade.opacidade, plano.faseDaGrade),
    });
  }
  sobre.push(...daMarca(["centro", "assunto"]));
  if (estilo.protecao) sobre.push(...(await avisosDeProtecao(largura, altura)));
  return sobre;
}

/** As marcas de uma versão de uma foto, pelo plano dela (src/lib/marca-distribuida.ts). */
function marcasDaFoto(
  largura: number,
  altura: number,
  modelo: ModeloMarca,
  tipo: TipoDeVersao,
  opcoes: OpcoesDaMarca,
) {
  const config = opcoes.config ?? CONFIG_MARCA_PADRAO;
  const base = { largura, altura, semente: opcoes.semente, config, versao: tipo };
  const plano = planejarMarcas({ ...base, modelo });
  return sobreposicoes(largura, altura, plano, planejarTrama(base), modelo);
}

/** Camada transparente do tamanho do vídeo com as marcas (em pixels crus RGBA). */
async function desenharCamada(
  largura: number,
  altura: number,
  modelo: ModeloMarca,
  opcoes: OpcoesDaMarca,
) {
  const sobre = await marcasDaFoto(largura, altura, modelo, "previa", opcoes);
  return sharp({
    create: {
      width: largura,
      height: altura,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(sobre)
    .png()
    .toBuffer();
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
 * Reduz a base, grava as marcas e salva em WebP. Pixels crus não carregam metadados (EXIF com
 * GPS e câmera, XMP, perfil ICC): nada disso chega à versão pública (docs/riscos.md, Privacidade).
 */
async function versao(
  base: Base,
  larguraMaxima: number,
  qualidade: number,
  modelo: ModeloMarca,
  tipo: TipoDeVersao,
  opcoes: OpcoesDaMarca,
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
  const marcas = await marcasDaFoto(info.width, info.height, modelo, tipo, opcoes);
  const buffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .composite(marcas)
    // effort 2 (de 0 a 6): bem mais rápido que o padrão (4), com arquivo quase do mesmo tamanho.
    .webp({ quality: qualidade, effort: 2 })
    .toBuffer();
  return { buffer, largura: info.width, altura: info.height };
}

/** Lado maior e qualidade de cada versão, pela configuração global. */
export function medidasDasVersoes(config: ConfigMarca = CONFIG_MARCA_PADRAO) {
  const previa = Math.min(LARGURA_ROSTOS, config.larguraPrevia);
  const pequenas = Math.min(QUALIDADE_MAXIMA_PEQUENAS, config.qualidade);
  return {
    previa: { largura: previa, qualidade: config.qualidade },
    previaCelular: { largura: Math.min(LARGURA_PREVIA_CELULAR, previa), qualidade: pequenas },
    miniatura: { largura: LARGURA_MINIATURA, qualidade: pequenas },
  };
}

export type VersoesDaFoto = {
  previa: ImagemGerada;
  /** A prévia menor, para o celular (LARGURA_PREVIA_CELULAR). */
  previaCelular: ImagemGerada;
  miniatura: ImagemGerada;
  /** JPEG reduzido e já girado para o reconhecimento facial. Nunca vai ao bucket público. */
  paraRostos: () => Promise<Buffer>;
};

/**
 * Prévia, prévia do celular e miniatura, todas com marca d'água (no modelo do dono do evento,
 * com a configuração global e o desenho próprio da foto), a partir de uma decodificação só do
 * original. A cópia para o reconhecimento facial sai da mesma base, só quando pedida.
 */
export async function gerarVersoes(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  opcoes: OpcoesDaMarca = { semente: "" },
): Promise<VersoesDaFoto> {
  const base = await decodificar(original, LARGURA_ROSTOS);
  const m = medidasDasVersoes(opcoes.config);
  const [previa, previaCelular, miniatura] = await Promise.all([
    versao(base, m.previa.largura, m.previa.qualidade, modelo, "previa", opcoes),
    versao(base, m.previaCelular.largura, m.previaCelular.qualidade, modelo, "previa", opcoes),
    versao(base, m.miniatura.largura, m.miniatura.qualidade, modelo, "miniatura", opcoes),
  ]);
  return {
    previa,
    previaCelular,
    miniatura,
    paraRostos: () => daBase(base).jpeg({ quality: 85 }).toBuffer(),
  };
}

/** Prévia com marca d'água para a página da foto (lado maior pela configuração; ~1600 px). */
export async function gerarPrevia(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  opcoes: OpcoesDaMarca = { semente: "" },
): Promise<ImagemGerada> {
  const { previa } = medidasDasVersoes(opcoes.config);
  const base = await decodificar(original, previa.largura);
  return versao(base, previa.largura, previa.qualidade, modelo, "previa", opcoes);
}

/** Miniatura com marca d'água para a grade da galeria (~400 px no lado maior). */
export async function gerarMiniatura(
  original: Buffer,
  modelo: ModeloMarca = MODELO_MARCA_PADRAO,
  opcoes: OpcoesDaMarca = { semente: "" },
): Promise<ImagemGerada> {
  const { miniatura } = medidasDasVersoes(opcoes.config);
  const base = await decodificar(original, miniatura.largura);
  return versao(base, miniatura.largura, miniatura.qualidade, modelo, "miniatura", opcoes);
}

/**
 * Amostra de um modelo de marca d'água numa foto de exemplo (800 px), para a escolha no painel e
 * para a tela do gestor. Sai do mesmo código das prévias de verdade (o que se vê aqui é o que o
 * cliente vai ver).
 */
export async function amostraDaMarca(
  modelo: ModeloMarca,
  config: ConfigMarca = CONFIG_MARCA_PADRAO,
): Promise<Buffer> {
  const foto = await readFile(path.join(process.cwd(), "public", "inicio", "ensaio-casal.webp"));
  const base = await decodificar(foto, 800);
  const opcoes = { semente: "amostra-da-marca", config };
  return (await versao(base, 800, config.qualidade, modelo, "previa", opcoes)).buffer;
}

/** Cópia reduzida e já girada para o reconhecimento facial (JPEG, até LARGURA_ROSTOS). */
export async function copiaParaRostos(original: Buffer): Promise<Buffer> {
  return daBase(await decodificar(original, LARGURA_ROSTOS))
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Camada da marca d'água como PNG transparente do tamanho de um vídeo: o mesmo desenho das fotos
 * (do modelo do dono do evento, com a configuração global e a variação pelo id do vídeo), posto
 * sobre cada quadro pelo FFmpeg (src/servicos/video.ts).
 */
export async function marcaDoVideo(
  largura: number,
  altura: number,
  modelo: ModeloMarca,
  opcoes: OpcoesDaMarca = { semente: "" },
) {
  return desenharCamada(largura, altura, modelo, opcoes);
}
