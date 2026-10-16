/**
 * Conta pura do desfoque do visualizador (docs/arquitetura.md, "Galeria e busca", visualizador):
 * onde fica o círculo nítido da "lanterna" no canvas, que pedaço da prévia desenhar nele e quais
 * blocos do mosaico pixelar. Sem DOM, para os testes rodarem no Node.
 *
 * O desfoque é proteção de experiência e contra o print casual, não segredo: o navegador baixa a
 * prévia (com marca d'água) para desenhar. A proteção real continua sendo o original privado e o
 * link temporário depois do pagamento.
 */

/** Raio do círculo nítido, como fração da largura da foto na tela (diâmetro ~50%). */
export const FRACAO_DO_RAIO = 0.25;
/** Borda suave: o círculo é nítido até esta fração do raio e some até a borda. */
export const MIOLO_NITIDO = 0.86;

export type Ponto = { x: number; y: number };
export type Caixa = { x: number; y: number; largura: number; altura: number };
export type Medida = { largura: number; altura: number };
export type Circulo = { x: number; y: number; r: number };

/**
 * Círculo da revelação em px do canvas, a partir do ponto do dedo ou do mouse (coordenadas da
 * tela) e da caixa da foto na tela (que pode estar escalada pela transição). `null` fora da foto.
 */
export function circuloDaRevelacao(
  ponto: Ponto,
  caixa: Caixa,
  canvas: Medida,
  fracao = FRACAO_DO_RAIO,
): Circulo | null {
  if (caixa.largura <= 0 || caixa.altura <= 0 || canvas.largura <= 0 || canvas.altura <= 0) {
    return null;
  }
  const rx = (ponto.x - caixa.x) / caixa.largura;
  const ry = (ponto.y - caixa.y) / caixa.altura;
  if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return null;
  return { x: rx * canvas.largura, y: ry * canvas.altura, r: fracao * canvas.largura };
}

/** Caixa (inteira, dentro do canvas) que contém o círculo: só ela é limpa e redesenhada. */
export function caixaDoCirculo(c: Circulo, canvas: Medida): Caixa {
  const x0 = Math.max(0, Math.floor(c.x - c.r));
  const y0 = Math.max(0, Math.floor(c.y - c.r));
  const x1 = Math.min(canvas.largura, Math.ceil(c.x + c.r));
  const y1 = Math.min(canvas.altura, Math.ceil(c.y + c.r));
  return { x: x0, y: y0, largura: Math.max(0, x1 - x0), altura: Math.max(0, y1 - y0) };
}

/**
 * Pedaço da prévia (em px da imagem) que corresponde a uma caixa do canvas, para desenhar só o
 * círculo com `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)`. A prévia e o canvas têm a mesma
 * proporção (a caixa da foto segue a proporção dela).
 */
export function fonteDaCaixa(caixa: Caixa, canvas: Medida, imagem: Medida) {
  const ex = imagem.largura / canvas.largura;
  const ey = imagem.altura / canvas.altura;
  return {
    sx: caixa.x * ex,
    sy: caixa.y * ey,
    sw: caixa.largura * ex,
    sh: caixa.altura * ey,
    dx: caixa.x,
    dy: caixa.y,
    dw: caixa.largura,
    dh: caixa.altura,
  };
}

/** Aumento da lupa: o círculo mostra um pedaço da foto 1,8 vez maior que na tela. */
export const ZOOM_DA_LENTE = 1.8;
/**
 * No toque, a lupa sobe para não ficar embaixo do dedo: o centro fica a (1 + isto) raios acima
 * do ponto tocado, então a borda de baixo do círculo fica um pouco acima da ponta do dedo.
 */
export const AFASTAMENTO_DO_DEDO = 0.35;

export type Lente = {
  /** Onde a lupa é desenhada no canvas (centro e raio). */
  circulo: Circulo;
  /** Pedaço da prévia (px da imagem) ampliado dentro da lupa: o que está sob o dedo. */
  fonte: { sx: number; sy: number; sw: number; sh: number };
  /** Quadrado do canvas em que a fonte é desenhada (o círculo recorta depois). */
  destino: Caixa;
};

/**
 * Lupa da revelação: amplia (ZOOM_DA_LENTE) o pedaço da prévia sob o dedo ou o mouse e o mostra
 * num círculo. No mouse, o círculo fica centrado no cursor; no toque, sobe (AFASTAMENTO_DO_DEDO)
 * para o dedo não tapar o que está sendo revelado. O círculo e a fonte nunca saem do canvas e
 * da imagem: perto da borda eles encostam nela em vez de cortar. `null` fora da foto.
 */
export function lenteDaRevelacao(
  ponto: Ponto,
  caixa: Caixa,
  canvas: Medida,
  imagem: Medida,
  {
    toque,
    zoom = ZOOM_DA_LENTE,
    fracao = FRACAO_DO_RAIO,
  }: { toque: boolean; zoom?: number; fracao?: number },
): Lente | null {
  const sob = circuloDaRevelacao(ponto, caixa, canvas, fracao);
  if (!sob || imagem.largura <= 0 || imagem.altura <= 0) return null;
  const r = Math.min(sob.r, canvas.largura / 2, canvas.altura / 2);
  const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const x = limitar(sob.x, r, canvas.largura - r);
  const y = limitar(sob.y - (toque ? r * (1 + AFASTAMENTO_DO_DEDO) : 0), r, canvas.altura - r);
  const ex = imagem.largura / canvas.largura;
  const ey = imagem.altura / canvas.altura;
  const sw = Math.min(imagem.largura, ((2 * r) / zoom) * ex);
  const sh = Math.min(imagem.altura, ((2 * r) / zoom) * ey);
  return {
    circulo: { x, y, r },
    fonte: {
      sx: limitar(sob.x * ex - sw / 2, 0, imagem.largura - sw),
      sy: limitar(sob.y * ey - sh / 2, 0, imagem.altura - sh),
      sw,
      sh,
    },
    destino: { x: x - r, y: y - r, largura: 2 * r, altura: 2 * r },
  };
}

/** Semente estável a partir do id da foto (o mosaico fica igual cada vez que ela abre). */
export function sementeDoId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Blocos do mosaico pixelado por cima do desfoque: uma fração das células de uma grade, sempre
 * as mesmas para a mesma semente. Gerador simples (mulberry32), sem repetir célula.
 */
export function celulasDoMosaico(semente: number, colunas: number, linhas: number, fracao = 0.16) {
  const total = Math.max(0, colunas * linhas);
  const quantas = Math.min(total, Math.round(total * Math.max(0, Math.min(1, fracao))));
  let s = semente >>> 0;
  const aleatorio = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const escolhidas = new Set<number>();
  while (escolhidas.size < quantas) escolhidas.add(Math.floor(aleatorio() * total));
  return [...escolhidas]
    .sort((a, b) => a - b)
    .map((i) => ({ coluna: i % colunas, linha: Math.floor(i / colunas) }));
}

/** Tamanho em que a prévia desfocada é gerada (uma vez por foto): no máximo `maximo` px. */
export function tamanhoDaBase(imagem: Medida, maximo = 640): Medida {
  const escala = Math.min(1, maximo / Math.max(imagem.largura, imagem.altura, 1));
  return {
    largura: Math.max(1, Math.round(imagem.largura * escala)),
    altura: Math.max(1, Math.round(imagem.altura * escala)),
  };
}
