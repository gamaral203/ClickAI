// Opções das artes de divulgação (formatos, cores e modelos): usadas pela tela da aba Design e
// pelo desenho das artes no servidor (src/lib/artes/modelos.tsx).

export const FORMATOS_DE_ARTE = {
  story: { largura: 1080, altura: 1920, nome: "Story", proporcao: "9:16" },
  feed: { largura: 1080, altura: 1350, nome: "Feed", proporcao: "4:5" },
  banner: { largura: 1200, altura: 630, nome: "Banner", proporcao: "1200×630" },
} as const;

export type FormatoDeArte = keyof typeof FORMATOS_DE_ARTE;

export const CORES_DE_ARTE = {
  azul: { nome: "Azul", fundo: "#2362FE", destaque: "#B8FF32", tinta: "#0B0B0F" },
  preto: { nome: "Preto", fundo: "#0B0B0F", destaque: "#B8FF32", tinta: "#0B0B0F" },
  vermelho: { nome: "Vermelho", fundo: "#E11D48", destaque: "#FFFFFF", tinta: "#E11D48" },
  verde: { nome: "Verde", fundo: "#15803D", destaque: "#FFFFFF", tinta: "#15803D" },
} as const;

export type CorDeArte = keyof typeof CORES_DE_ARTE;

/** Modelos verticais (story e feed) e de banner. O id vai na URL (`?modelo=`). */
export const MODELOS_VERTICAIS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export const MODELOS_BANNER = ["b1", "b2", "b3"] as const;
export type ModeloDeArte = (typeof MODELOS_VERTICAIS)[number] | (typeof MODELOS_BANNER)[number];

export function modelosDoFormato(formato: FormatoDeArte): readonly ModeloDeArte[] {
  return formato === "banner" ? MODELOS_BANNER : MODELOS_VERTICAIS;
}

export function nomeDoModelo(modelo: ModeloDeArte) {
  return modelo.startsWith("b") ? `Banner ${modelo.slice(1)}` : `Modelo ${modelo}`;
}
