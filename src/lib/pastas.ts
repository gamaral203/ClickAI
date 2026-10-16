// Árvore das pastas de um evento: pasta de nível 1 e subpastas (no máximo 2 níveis). Funções
// puras, usadas no servidor e nas telas (painel e galeria).

/** No máximo 2 níveis: pasta → subpasta. */
export const NIVEIS_DE_PASTA = 2;

/** Separador do caminho da pasta: "Largada › Bateria 1". */
export const SEPARADOR_DE_PASTA = " › ";

type PastaBasica = { id: string; nome: string; pastaPaiId: string | null; ordem: number };

export type PastaNaArvore<T> = T & {
  nivel: 1 | 2;
  /** "Largada" ou "Largada › Bateria 1". */
  caminho: string;
};

function porOrdem(a: PastaBasica, b: PastaBasica) {
  return a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id);
}

/**
 * Pastas na ordem da árvore: cada pasta de nível 1 (na ordem do fotógrafo) seguida das
 * subpastas dela. Subpasta cuja pasta de cima não está na lista entra como nível 1.
 */
export function arvoreDePastas<T extends PastaBasica>(pastas: T[]): PastaNaArvore<T>[] {
  const ids = new Set(pastas.map((p) => p.id));
  const filhas = new Map<string, T[]>();
  const raizes: T[] = [];
  for (const p of pastas) {
    if (p.pastaPaiId && ids.has(p.pastaPaiId)) {
      const lista = filhas.get(p.pastaPaiId) ?? [];
      lista.push(p);
      filhas.set(p.pastaPaiId, lista);
    } else {
      raizes.push(p);
    }
  }
  const resultado: PastaNaArvore<T>[] = [];
  for (const raiz of raizes.sort(porOrdem)) {
    resultado.push({ ...raiz, nivel: 1, caminho: raiz.nome });
    for (const filha of (filhas.get(raiz.id) ?? []).sort(porOrdem)) {
      resultado.push({
        ...filha,
        nivel: 2,
        caminho: `${raiz.nome}${SEPARADOR_DE_PASTA}${filha.nome}`,
      });
    }
  }
  return resultado;
}

/** Ids da pasta e das subpastas dela (para filtrar "a pasta com tudo dentro"). */
export function idsDaPastaComSubpastas(
  pastaId: string,
  pastas: Pick<PastaBasica, "id" | "pastaPaiId">[],
): Set<string> {
  const ids = new Set([pastaId]);
  for (const p of pastas) if (p.pastaPaiId === pastaId) ids.add(p.id);
  return ids;
}
