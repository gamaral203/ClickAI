// Conteúdo calculado da página para fotógrafos (/vender-fotos): os slides do topo e o exemplo de
// quanto o fotógrafo recebe. Os números saem das mesmas funções do saque, então a página não
// consegue dizer outra coisa que não o que o sistema cobra.

import { comissaoDe, taxaAntecipacaoDe } from "@/servicos/financeiro";

import { acrescimoCartao, parteDoVendedorNaTaxa } from "./taxas";
import { IMAGENS_INICIO, type ImagemVitrine } from "./vitrine-inicio";

export type SlideImagem = { tipo: "imagem"; rotulo: string; imagem: ImagemVitrine };

export type SlideVideo = {
  tipo: "video";
  rotulo: string;
  /** Arquivo MP4 em public/vitrine/. */
  src: string;
  /** Imagem mostrada antes de o vídeo começar e para quem pede menos movimento. */
  poster: string;
  /** Descrição do vídeo, para leitor de tela. */
  alt: string;
};

export type SlideTopo = SlideImagem | SlideVideo;

/**
 * Slides do carrossel do topo. Para colocar o vídeo oficial, basta acrescentar este item no começo
 * da lista, com os arquivos em public/vitrine/; o componente já sabe tocar (sem som e parado fora
 * da tela):
 *
 *   {
 *     tipo: "video",
 *     rotulo: "Conheça o ClicouAí",
 *     src: "/vitrine/video-fotografos.mp4",
 *     poster: "/vitrine/video-fotografos-poster.webp",
 *     alt: "O que acontece no vídeo, em uma frase",
 *   },
 */
export const SLIDES_TOPO: SlideTopo[] = [
  { tipo: "imagem", rotulo: "Corridas", imagem: IMAGENS_INICIO.corridaRua },
  { tipo: "imagem", rotulo: "Festas", imagem: IMAGENS_INICIO.chaRevelacao },
  { tipo: "imagem", rotulo: "Vaquejadas e montarias", imagem: IMAGENS_INICIO.vaquejada },
  { tipo: "imagem", rotulo: "Esportes", imagem: IMAGENS_INICIO.futebol },
  { tipo: "imagem", rotulo: "Casamentos", imagem: IMAGENS_INICIO.casamento },
];

export type ExemploDeVenda = {
  clientePagaCentavos: number;
  /** Metade da taxa do cartão que sai da parte do fotógrafo; zero no Pix. */
  taxaCartaoCentavos: number;
  comissaoCentavos: number;
  /** Só no cartão antecipado. */
  antecipacaoCentavos: number;
  recebeCentavos: number;
};

/** Quanto o fotógrafo recebe de uma venda, pela mesma conta do lançamento e do saque. */
export function exemploDeVenda(
  precoCentavos: number,
  forma: "pix" | "cartao" | "cartao_antecipado",
  comissaoPct: number,
  taxaCartaoPct: number,
): ExemploDeVenda {
  const noCartao = forma !== "pix";
  const taxaCartaoCentavos = noCartao ? parteDoVendedorNaTaxa(precoCentavos, taxaCartaoPct) : 0;
  const bruto = precoCentavos - taxaCartaoCentavos;
  const comissaoCentavos = comissaoDe(bruto, comissaoPct);
  const antecipacaoCentavos = forma === "cartao_antecipado" ? taxaAntecipacaoDe(bruto) : 0;
  return {
    clientePagaCentavos:
      precoCentavos + (noCartao ? acrescimoCartao(precoCentavos, taxaCartaoPct) : 0),
    taxaCartaoCentavos,
    comissaoCentavos,
    antecipacaoCentavos,
    recebeCentavos: bruto - comissaoCentavos - antecipacaoCentavos,
  };
}
