// Modelos de marca d'água que o fotógrafo escolhe em Painel > Marca d'água. O desenho de cada um
// fica em src/servicos/imagens.ts; aqui, só o que a tela e o banco precisam saber.

export const MODELOS_MARCA = ["discreta", "padrao", "densa", "central", "grade", "maxima"] as const;

export type ModeloMarca = (typeof MODELOS_MARCA)[number];

export const MODELO_MARCA_PADRAO: ModeloMarca = "padrao";

export type InfoModeloMarca = {
  nome: string;
  descricao: string;
  /** De 1 a 5: quanto da foto aparece. */
  visibilidade: number;
  /** De 1 a 5: quão difícil é aproveitar a prévia sem comprar. */
  protecao: number;
};

export const INFO_MODELOS_MARCA: Record<ModeloMarca, InfoModeloMarca> = {
  discreta: {
    nome: "Discreta",
    descricao: "Marca grande sobre a pessoa, com o fundo um pouco mais suave.",
    visibilidade: 4,
    protecao: 4,
  },
  padrao: {
    nome: "Padrão",
    descricao: "Marca grande sobre a pessoa, grade de texto, linhas e faixas.",
    visibilidade: 3,
    protecao: 5,
  },
  densa: {
    nome: "Densa",
    descricao: "Como a padrão, com o texto da grade menor e mais próximo.",
    visibilidade: 3,
    protecao: 5,
  },
  central: {
    nome: "Central",
    descricao: "Marca sobre a pessoa ainda maior e mais forte.",
    visibilidade: 3,
    protecao: 5,
  },
  grade: {
    nome: "Grade",
    descricao: "Como a padrão, com mais linhas cruzadas.",
    visibilidade: 3,
    protecao: 5,
  },
  maxima: {
    nome: "Máxima",
    descricao: "Tudo no mais forte: grade densa, mais linhas e faixas.",
    visibilidade: 2,
    protecao: 5,
  },
};

export function ehModeloMarca(valor: unknown): valor is ModeloMarca {
  return typeof valor === "string" && (MODELOS_MARCA as readonly string[]).includes(valor);
}

/**
 * Versão do desenho das prévias (src/servicos/imagens.ts). Sobe quando a marca ou o tamanho da
 * prévia mudam: as fotos com prévia de versão anterior são regeradas a partir do original
 * (src/servicos/regerar-previas.ts). A versão vai na chave do R2 (`...-v2.webp`): a chave nova
 * fura o cache do navegador e da CDN (as prévias são gravadas com cache "immutable").
 *   1: até out. 2026, prévia de 1600 px (WebP 72) e o padrão de logos.
 *   2: prévia de 800 px (WebP 55), marca principal forte ("ClicouAí" e "PRÉVIA · NÃO
 *      AUTORIZADA") sobre o maior rosto, grade de texto, linhas e faixas, tudo variando por
 *      foto, contra a remoção por IA (docs/riscos.md). Depois do cadastro dos rostos no envio,
 *      a chave ganha "-r" (`...-r-v2.webp`): a prévia foi refeita com a marca sobre eles.
 */
export const VERSAO_DA_MARCA = 2;

/** Sufixo da chave da prévia e da miniatura na versão atual. */
export const SUFIXO_DA_VERSAO = `-v${VERSAO_DA_MARCA}.webp`;

/** Versão da marca de uma chave de prévia ou miniatura (sem sufixo: versão 1). */
export function versaoDaChave(chave: string): number {
  const achado = /-v(\d+)\.webp$/.exec(chave);
  return achado ? Number(achado[1]) : 1;
}
