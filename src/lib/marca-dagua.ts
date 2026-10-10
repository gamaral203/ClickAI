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
    descricao: "Poucas logos grandes e bem suaves.",
    visibilidade: 5,
    protecao: 2,
  },
  padrao: {
    nome: "Padrão",
    descricao: "Logos inclinadas pela foto toda.",
    visibilidade: 4,
    protecao: 3,
  },
  densa: {
    nome: "Densa",
    descricao: "Logos menores e mais próximas.",
    visibilidade: 3,
    protecao: 4,
  },
  central: {
    nome: "Central",
    descricao: "Uma logo grande no meio e outras suaves em volta.",
    visibilidade: 3,
    protecao: 4,
  },
  grade: {
    nome: "Grade",
    descricao: "Linhas cruzadas finas com as logos.",
    visibilidade: 4,
    protecao: 4,
  },
  maxima: {
    nome: "Máxima",
    descricao: "Logos densas, grade e logo no meio.",
    visibilidade: 2,
    protecao: 5,
  },
};

export function ehModeloMarca(valor: unknown): valor is ModeloMarca {
  return typeof valor === "string" && (MODELOS_MARCA as readonly string[]).includes(valor);
}
