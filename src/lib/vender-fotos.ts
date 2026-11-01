// Conteúdo da página para fotógrafos (/vender-fotos): os arquivos do vídeo do topo e o exemplo de
// quanto o fotógrafo recebe. Os números saem das mesmas funções do saque, então a página não
// consegue dizer outra coisa que não o que o sistema cobra.

import { comissaoDe, taxaAntecipacaoDe } from "@/servicos/financeiro";

import { acrescimoCartao, parteDoVendedorNaTaxa } from "./taxas";

/** Vídeo oficial do dono, de fundo no topo. O pôster é o que aparece sem o vídeo tocando. */
export const VIDEO_DO_TOPO = {
  src: "/vitrine/video-fotografos.mp4",
  poster: "/vitrine/video-fotografos-poster.webp",
};

/** Foto de divulgação fornecida pelo dono, na seção de benefícios. Fora do og:image. */
export const FOTO_BENEFICIOS = {
  src: "/vitrine/corredora-apontando.webp",
  alt: "Corredora sorridente de camiseta limão e óculos escuros aponta para a câmera durante uma corrida de rua, com um morro ao fundo",
};

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
