// Modelos de marca d'água que o fotógrafo escolhe em Painel > Marca d'água. O desenho de cada um
// fica em src/servicos/imagens.ts; aqui, só o que a tela e o banco precisam saber.

export const MODELOS_MARCA = [
  "discreta",
  "padrao",
  "densa",
  "central",
  "grade",
  "maxima",
  "forte",
] as const;

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
  forte: {
    nome: "Proteção forte",
    descricao: "Anéis grandes sobre a pessoa, linhas e avisos de foto protegida.",
    visibilidade: 2,
    protecao: 5,
  },
};

export function ehModeloMarca(valor: unknown): valor is ModeloMarca {
  return typeof valor === "string" && (MODELOS_MARCA as readonly string[]).includes(valor);
}

/**
 * Versão do desenho das prévias (src/servicos/imagens.ts). Sobe quando o código da marca ou do
 * tamanho da prévia muda. A versão vai na chave do R2 (`...-v5-r2.webp`): a chave nova fura o
 * cache do navegador e da CDN (as prévias são gravadas com cache "immutable").
 *   1: até out. 2026, prévia de 1600 px (WebP 72) e o padrão de logos; sem sufixo na chave.
 *   2: 11/10/2026, prévia de 800 px (WebP 55) com marca grande sobre os rostos, grade de texto,
 *      linhas e faixas. Revertida no dia seguinte: estragava a prévia para quem compra.
 *   3: 12/10/2026, o mesmo desenho da versão 1, em chave nova para a regeração trocar as prévias
 *      da versão 2 (as da versão 1 também são regeradas; saem iguais).
 *   4: 14/10/2026, o mesmo desenho, mais a prévia do celular (1000 px, `chaveDaPreviaCelular`):
 *      a regeração cria essa terceira versão nas fotos já enviadas.
 *   5: 15/10/2026, marca distribuída com variação por foto (src/lib/marca-distribuida.ts) e a
 *      configuração global do gestor; a chave leva também a revisão da configuração
 *      (`-v5-r{revisão}.webp`, revisão 0 = os padrões). As fotos de antes só trocam de desenho
 *      quando o gestor manda regerar (/admin/marca-dagua).
 */
export const VERSAO_DA_MARCA = 5;

/**
 * Versão mínima que a regeração automática garante (job de revisão e /api/jobs/regerar-previas
 * sem pedido do gestor): refaz só as versões 2 e 3, que não têm a prévia do celular. Daí para
 * cima, trocar o desenho é decisão do gestor, com a estimativa de custo na tela.
 */
export const VERSAO_MINIMA_AUTOMATICA = 4;

/** Sufixo da chave da prévia e da miniatura na versão atual, com a revisão da configuração. */
export function sufixoDaVersao(revisao: number): string {
  return `-v${VERSAO_DA_MARCA}-r${Math.max(0, Math.floor(revisao))}.webp`;
}

/**
 * Prévia menor, para o celular (src/servicos/imagens.ts, LARGURA_PREVIA_CELULAR), gravada ao lado
 * da prévia desde a versão 4: a mesma chave com `-celular`. Serve a chave ou a URL completa;
 * `null` nas prévias de versão anterior (e nos dados de exemplo), que não têm essa versão.
 */
export function chaveDaPreviaCelular(chavePrevia: string): string | null {
  if (versaoDaChave(chavePrevia) < 4) return null;
  return chavePrevia.replace(/\.webp$/, "-celular.webp");
}

/** `-v4.webp` ou, desde a versão 5, `-v5-r3.webp` (versão e revisão da configuração). */
const VERSAO_NA_CHAVE = /-v(\d+)(?:-r(\d+))?\.webp$/;

/** Versão da marca de uma chave de prévia ou miniatura (sem sufixo: versão 1). */
export function versaoDaChave(chave: string): number {
  const achado = VERSAO_NA_CHAVE.exec(chave);
  return achado ? Number(achado[1]) : 1;
}

/** Revisão da configuração na chave (`-v5-r3.webp` = 3), ou `null` nas versões sem revisão. */
export function revisaoDaChave(chave: string): number | null {
  const achado = VERSAO_NA_CHAVE.exec(chave);
  return achado?.[2] !== undefined ? Number(achado[2]) : null;
}
