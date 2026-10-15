/**
 * Lógica pura do visualizador da foto na galeria do evento (docs/arquitetura.md, "Galeria e
 * busca", visualizador): para onde ir com "anterior"/"próxima" (dentro da página carregada ou
 * pedindo a página vizinha ao servidor), que imagem mostrar (só a prévia com marca d'água), o
 * que um gesto quer dizer e a conta da transição a partir da miniatura. Sem React nem DOM, para
 * os testes rodarem no Node.
 */

/** O que o visualizador precisa de cada foto: só endereços de prévia, nunca do original. */
export type FotoDoVisualizador = {
  id: string;
  urlPrevia: string;
  urlPreviaCelular?: string | null;
  urlMiniatura: string;
  largura: number;
  altura: number;
};

/** Páginas da galeria carregadas no visualizador (a da tela e as vizinhas pedidas). */
export type Paginas = { pagina: number; totalPaginas: number };

export type Passo =
  /** Outra foto da lista já carregada. */
  | { tipo: "indice"; indice: number }
  /** Passa para a página vizinha: carregar e abrir a primeira (`inicio`) ou a última (`fim`). */
  | { tipo: "pagina"; pagina: number; posicao: "inicio" | "fim" }
  /** Começo ou fim da galeria (ou da busca): não há para onde ir. */
  | null;

/**
 * Próxima (`+1`) ou anterior (`-1`) a partir de `indice` numa lista de `tamanho` fotos, que é a
 * página `pagina` da galeria. Sem paginação (resultado da busca), fica na lista.
 */
export function passoDaNavegacao(
  indice: number,
  tamanho: number,
  direcao: 1 | -1,
  paginas: Paginas | null,
): Passo {
  if (tamanho <= 0) return null;
  const alvo = indice + direcao;
  if (alvo >= 0 && alvo < tamanho) return { tipo: "indice", indice: alvo };
  if (!paginas) return null;
  const pagina = paginas.pagina + direcao;
  if (pagina < 1 || pagina > paginas.totalPaginas) return null;
  return { tipo: "pagina", pagina, posicao: direcao === 1 ? "inicio" : "fim" };
}

/** Índice a abrir na página recém-carregada (a primeira ou a última foto). */
export function indiceDaPosicao(posicao: "inicio" | "fim", tamanho: number) {
  return posicao === "inicio" ? 0 : Math.max(0, tamanho - 1);
}

/** Há para onde ir nessa direção (para mostrar ou esconder a seta)? */
export function podeIr(indice: number, tamanho: number, direcao: 1 | -1, paginas: Paginas | null) {
  return passoDaNavegacao(indice, tamanho, direcao, paginas) !== null;
}

/** Vizinhas para pré-carregar: a anterior e a próxima da lista carregada, se houver. */
export function vizinhas<T>(lista: readonly T[], indice: number): T[] {
  return [lista[indice - 1], lista[indice + 1]].filter((f): f is T => f !== undefined);
}

/**
 * A imagem que o visualizador mostra: a prévia do celular (1000 px) em telas estreitas, quando
 * existe, e a prévia normal no resto. Só lê os campos de prévia: o original não chega ao
 * navegador e não tem como sair daqui.
 */
export function imagemDoVisualizador(foto: FotoDoVisualizador, telaEstreita: boolean) {
  return telaEstreita && foto.urlPreviaCelular ? foto.urlPreviaCelular : foto.urlPrevia;
}

/** Limites dos gestos (px e px/s). */
export const GESTO = {
  distanciaLateral: 80,
  velocidadeLateral: 500,
  distanciaFechar: 120,
  velocidadeFechar: 600,
} as const;

export type AcaoDoGesto = "proxima" | "anterior" | "fechar" | null;

/**
 * O que um arrasto quer dizer, pelo deslocamento e a velocidade no fim: para os lados troca de
 * foto (para a esquerda, a próxima); para baixo fecha. Arrasto curto e lento volta ao lugar.
 */
export function acaoDoGesto(
  deslocamento: { x: number; y: number },
  velocidade: { x: number; y: number },
): AcaoDoGesto {
  const lateral = Math.abs(deslocamento.x) >= Math.abs(deslocamento.y);
  if (lateral) {
    if (deslocamento.x <= -GESTO.distanciaLateral || velocidade.x <= -GESTO.velocidadeLateral) {
      return deslocamento.x <= 0 ? "proxima" : null;
    }
    if (deslocamento.x >= GESTO.distanciaLateral || velocidade.x >= GESTO.velocidadeLateral) {
      return deslocamento.x >= 0 ? "anterior" : null;
    }
    return null;
  }
  if (deslocamento.y >= GESTO.distanciaFechar || velocidade.y >= GESTO.velocidadeFechar) {
    return deslocamento.y > 0 ? "fechar" : null;
  }
  return null;
}

export type Retangulo = { x: number; y: number; largura: number; altura: number };

/**
 * Transição a partir da miniatura (FLIP): o deslocamento, a escala e o recorte que deixam a
 * prévia, já no lugar final, exatamente sobre a miniatura quadrada (recortada em `cover`). A
 * escala é a mesma nos dois eixos (a foto não deforma) e o recorte esconde o que a miniatura
 * cortava; animar daqui até zero dá o zoom da miniatura para a foto inteira.
 */
export function partidaDaMiniatura(miniatura: Retangulo, final: Retangulo) {
  if (final.largura <= 0 || final.altura <= 0) return null;
  const escala = Math.max(miniatura.largura / final.largura, miniatura.altura / final.altura);
  // Parte da foto final que aparece na miniatura, em px da foto final (antes da escala).
  const visivelL = miniatura.largura / escala;
  const visivelA = miniatura.altura / escala;
  const recorteX = Math.max(0, (final.largura - visivelL) / 2);
  const recorteY = Math.max(0, (final.altura - visivelA) / 2);
  const centroMini = {
    x: miniatura.x + miniatura.largura / 2,
    y: miniatura.y + miniatura.altura / 2,
  };
  const centroFinal = { x: final.x + final.largura / 2, y: final.y + final.altura / 2 };
  return {
    x: centroMini.x - centroFinal.x,
    y: centroMini.y - centroFinal.y,
    escala,
    recorte: `inset(${recorteY.toFixed(1)}px ${recorteX.toFixed(1)}px ${recorteY.toFixed(1)}px ${recorteX.toFixed(1)}px round ${(8 / escala).toFixed(1)}px)`,
  };
}

/** Tamanho da foto encaixada (`contain`) numa área, para saber onde ela vai ficar. */
export function encaixar(
  foto: { largura: number; altura: number },
  area: { largura: number; altura: number },
) {
  if (foto.largura <= 0 || foto.altura <= 0) return { largura: area.largura, altura: area.altura };
  const escala = Math.min(area.largura / foto.largura, area.altura / foto.altura);
  return { largura: foto.largura * escala, altura: foto.altura * escala };
}

/**
 * Sobre a foto, segurar e arrastar revela por partes; um deslize mais rápido que isto (ms) é
 * gesto de navegação (para os lados) ou de fechar (para baixo).
 */
export const TOQUE_RAPIDO_MS = 250;
