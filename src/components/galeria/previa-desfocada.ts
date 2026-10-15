"use client";

import { celulasDoMosaico, sementeDoId, tamanhoDaBase } from "@/lib/desfoque";

/**
 * Prévia desfocada do visualizador, feita no navegador a partir da prévia que já existe (com a
 * marca d'água): nada novo no R2 nem no servidor. Gerada uma vez por foto e guardada na memória
 * da aba (as últimas `LIMITE`). A prévia carregada fica só num `Image` fora da página, para a
 * "lanterna" desenhar o círculo nítido; ela nunca entra inteira na tela.
 *
 * É proteção de experiência e contra o print casual, não segredo: o navegador baixa a prévia.
 */

export type PreviaPronta = {
  /** A prévia carregada (fora do DOM), fonte do círculo nítido. */
  imagem: HTMLImageElement;
  /** A versão desfocada e pixelada, desenhada uma vez. */
  base: HTMLCanvasElement;
};

const LIMITE = 24;
const cache = new Map<string, Promise<PreviaPronta>>();

function carregar(url: string) {
  return new Promise<HTMLImageElement>((resolver, rejeitar) => {
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => resolver(img);
    img.onerror = () => rejeitar(new Error("prévia não carregou"));
    img.src = url;
  });
}

/** Desfoque forte (reduz muito e amplia de volta, com blur) e alguns blocos de mosaico. */
function desfocar(img: HTMLImageElement, id: string): HTMLCanvasElement {
  const { largura, altura } = tamanhoDaBase({
    largura: img.naturalWidth,
    altura: img.naturalHeight,
  });
  const base = document.createElement("canvas");
  base.width = largura;
  base.height = altura;
  const ctx = base.getContext("2d");
  if (!ctx) return base;

  // Versão minúscula: ampliada com suavização vira o desfoque (funciona até sem `ctx.filter`).
  const fator = 22;
  const mini = document.createElement("canvas");
  mini.width = Math.max(2, Math.round(largura / fator));
  mini.height = Math.max(2, Math.round(altura / fator));
  const ctxMini = mini.getContext("2d");
  ctxMini?.drawImage(img, 0, 0, mini.width, mini.height);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mini, 0, 0, largura, altura);
  if ("filter" in ctx) {
    ctx.filter = `blur(${Math.max(2, Math.round(largura / 90))}px)`;
    ctx.drawImage(mini, 0, 0, largura, altura);
    ctx.filter = "none";
  }

  // Mosaico: alguns blocos pixelados (4x4 "pixels" grandes cada), sempre os mesmos para a
  // mesma foto.
  const colunas = 12;
  const linhas = Math.max(1, Math.round((colunas * altura) / largura));
  const porBloco = 4;
  const bloco = document.createElement("canvas");
  bloco.width = colunas * porBloco;
  bloco.height = linhas * porBloco;
  bloco.getContext("2d")?.drawImage(img, 0, 0, bloco.width, bloco.height);
  const cw = largura / colunas;
  const ch = altura / linhas;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.9;
  for (const { coluna, linha } of celulasDoMosaico(sementeDoId(id), colunas, linhas, 0.12)) {
    ctx.drawImage(
      bloco,
      coluna * porBloco,
      linha * porBloco,
      porBloco,
      porBloco,
      coluna * cw,
      linha * ch,
      cw,
      ch,
    );
  }
  ctx.globalAlpha = 1;
  return base;
}

/**
 * Prévia pronta para o visualizador (carregada e desfocada), da memória quando já foi feita.
 * Também serve para preparar a anterior e a próxima.
 */
export function prepararPrevia(id: string, url: string): Promise<PreviaPronta> {
  const chave = `${id}|${url}`;
  const guardada = cache.get(chave);
  if (guardada) {
    // Mais recente no fim (para sair por último).
    cache.delete(chave);
    cache.set(chave, guardada);
    return guardada;
  }
  const pedido = carregar(url).then(async (imagem) => {
    await imagem.decode?.().catch(() => {});
    return { imagem, base: desfocar(imagem, id) };
  });
  pedido.catch(() => cache.delete(chave));
  cache.set(chave, pedido);
  while (cache.size > LIMITE) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga === undefined) break;
    cache.delete(maisAntiga);
  }
  return pedido;
}
