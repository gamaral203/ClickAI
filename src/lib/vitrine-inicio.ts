// Imagens e categorias da página inicial, num lugar só. Para trocar ou adicionar uma foto, basta
// mexer aqui: o hero (colagem) e os cartões de categoria leem esta lista.
//
// Só imagens reais e autorizadas pelo dono, sem metadados (EXIF/GPS), em versões geradas com
// `sharp`: a inteira (até 1600 px no lado maior), a reduzida (720 a 800 px), para os cartões, e a
// pequena (até 600 px), para o celular. As da antiga vitrine ficam em public/inicio/ (reduzidas em
// public/inicio/reduzidas/, pequenas em public/inicio/pequenas/); as enviadas para o redesenho, em
// public/vitrine/ (`-800` é a reduzida e `-600`, a pequena). Nunca baixar imagens da
// internet nem usar as de outros sites.
//
// Sem imagem (`imagem: null`), o cartão mostra um fundo na cor da marca com o ícone da categoria.

export type ImagemVitrine = {
  /** Arquivo inteiro: usado onde a imagem aparece grande (colagem do computador). */
  src: string;
  /** Versão de 720 a 800 px: cartões do tablet e do computador. */
  reduzida: string;
  /**
   * Versão de até 600 px no lado maior, para o celular (colagem do hero e cartões de categoria),
   * onde a foto aparece com uns 100 px de largura. Sem ela, o celular usa a `reduzida`.
   */
  pequena?: string;
  alt: string;
  /** Onde ancorar o recorte (`object-position`). */
  foco?: string;
};

/** Ícones disponíveis para as categorias (lucide-react; o componente faz o mapeamento). */
export type IconeCategoria =
  "casamentos" | "corridas" | "festas" | "formaturas" | "vaquejadas" | "esportes";

export const IMAGENS_INICIO = {
  corrida: {
    src: "/vitrine/corrida.webp",
    reduzida: "/vitrine/corrida-800.webp",
    pequena: "/vitrine/corrida-600.webp",
    alt: "Corredor de óculos escuros e camiseta camuflada com faixa verde-limão, apontando para cima durante a corrida",
    foco: "50% 18%",
  },
  futebol: {
    src: "/vitrine/esportes-futebol.webp",
    reduzida: "/vitrine/esportes-futebol-800.webp",
    pequena: "/vitrine/esportes-futebol-600.webp",
    alt: "Dois jogadores disputando a bola num campo de terra, um de camisa vermelha e branca e outro de azul e preta",
    foco: "38% 35%",
  },
  montaria: {
    src: "/vitrine/montaria.webp",
    reduzida: "/vitrine/montaria-800.webp",
    pequena: "/vitrine/montaria-600.webp",
    alt: "Amazona de chapéu preto e camisa rosa da Montaria Feminina, segurando uma bandeira vermelha",
    foco: "60% 15%",
  },
  chaRevelacao: {
    src: "/vitrine/festa-cha-revelacao.webp",
    reduzida: "/vitrine/festa-cha-revelacao-800.webp",
    pequena: "/vitrine/festa-cha-revelacao-600.webp",
    alt: "Casal se abraça em meio à fumaça rosa num chá revelação, sobre um palco branco com balões",
    foco: "45% 50%",
  },
  corridaRua: {
    src: "/inicio/corrida-rua.webp",
    reduzida: "/inicio/reduzidas/corrida-rua.webp",
    alt: "Corredora de regata branca e verde, com o número de peito 73, numa corrida de rua arborizada",
    foco: "40% 40%",
  },
  festa: {
    src: "/inicio/torcida.webp",
    reduzida: "/inicio/reduzidas/torcida.webp",
    alt: "Torcedora de camisa do Brasil e óculos, com apito na boca e o braço erguido, numa festa de torcida",
    foco: "50% 35%",
  },
  casamento: {
    src: "/inicio/ensaio-casal.webp",
    reduzida: "/inicio/reduzidas/ensaio-casal.webp",
    pequena: "/inicio/pequenas/ensaio-casal.webp",
    alt: "Casal sorrindo abraçado ao ar livre, ela de vestido branco e ele de camisa clara",
    foco: "50% 35%",
  },
  cerimonia: {
    src: "/inicio/igreja.webp",
    reduzida: "/inicio/reduzidas/igreja.webp",
    alt: "Altar de igreja em azul e dourado iluminado por velas, com a imagem no centro e fiéis na penumbra",
    foco: "50% 45%",
  },
  vaquejada: {
    src: "/inicio/salto.webp",
    reduzida: "/inicio/reduzidas/salto.webp",
    alt: "Cavaleiro de boné saltando uma barra vermelha com o cavalo, numa prova noturna com público na cerca",
    foco: "45% 25%",
  },
} satisfies Record<string, ImagemVitrine>;

export type PainelMosaico = { rotulo: string; imagem: ImagemVitrine };

/** Lugares da colagem do hero no computador (a posição e a inclinação ficam no componente). */
export type LugarColagem =
  "principal" | "topo" | "direita" | "centroBaixo" | "direitaBaixo" | "esquerdaBaixo";

/**
 * Colagem do hero no computador: fotos em cartões arredondados, inclinados e sobrepostos. Cada
 * lugar recebe uma foto; para trocar, troque a `imagem`. `principal` é o cartão grande vertical à
 * esquerda (o único carregado com prioridade); `direita` é o lugar da formatura, com outra foto
 * enquanto não houver uma de formatura.
 */
export const COLAGEM_HERO: Record<LugarColagem, PainelMosaico> = {
  principal: { rotulo: "Corridas", imagem: IMAGENS_INICIO.corrida },
  topo: { rotulo: "Torcidas", imagem: IMAGENS_INICIO.festa },
  // Lugar da formatura: sem foto de formatura ainda, vai o chá revelação (o rosa contrasta com o azul).
  direita: { rotulo: "Festas", imagem: IMAGENS_INICIO.chaRevelacao },
  centroBaixo: { rotulo: "Vaquejadas e montarias", imagem: IMAGENS_INICIO.montaria },
  direitaBaixo: { rotulo: "Esportes", imagem: IMAGENS_INICIO.futebol },
  esquerdaBaixo: { rotulo: "Casamentos", imagem: IMAGENS_INICIO.casamento },
};

/** Colagem do hero no celular e no tablet: três fotos sobrepostas ao lado do título. */
export const COLAGEM_HERO_CELULAR: PainelMosaico[] = [
  { rotulo: "Corridas", imagem: IMAGENS_INICIO.corrida },
  { rotulo: "Festas", imagem: IMAGENS_INICIO.chaRevelacao },
  { rotulo: "Vaquejadas e montarias", imagem: IMAGENS_INICIO.montaria },
];

/**
 * As 6 categorias populares. `slug` é o da tabela `categorias` (o filtro `?categoria=` de
 * /eventos); o nome do cartão pode ser mais curto que o do banco. `null` deixa o cartão sem link.
 */
export const CATEGORIAS_INICIO: {
  nome: string;
  slug: string | null;
  icone: IconeCategoria;
  imagem: ImagemVitrine | null;
}[] = [
  { nome: "Casamentos", slug: "casamentos", icone: "casamentos", imagem: IMAGENS_INICIO.casamento },
  { nome: "Corridas", slug: "corrida", icone: "corridas", imagem: IMAGENS_INICIO.corrida },
  // No banco, "Shows e Festas".
  { nome: "Festas", slug: "festas", icone: "festas", imagem: IMAGENS_INICIO.chaRevelacao },
  // Sem foto de formatura ainda: fundo na cor da marca com o ícone.
  { nome: "Formaturas", slug: "formatura", icone: "formaturas", imagem: null },
  // No banco, "Cavalgadas e Vaquejadas".
  {
    nome: "Vaquejadas e Montarias",
    slug: "cavalgadas-e-vaquejadas",
    icone: "vaquejadas",
    imagem: IMAGENS_INICIO.montaria,
  },
  { nome: "Esportes", slug: "esportes", icone: "esportes", imagem: IMAGENS_INICIO.futebol },
];

/** Link do cartão de categoria: a lista de eventos já filtrada. */
export function linkDaCategoria(slug: string) {
  return `/eventos?categoria=${encodeURIComponent(slug)}`;
}
