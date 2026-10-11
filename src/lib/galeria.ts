import type { FiltroGaleria } from "@/dados";

/**
 * Fotos por página da galeria do evento. 48 fecha a grade em todas as larguras (2, 3 e 4
 * colunas) e mantém a página leve no celular (24 linhas de 2 miniaturas).
 */
export const FOTOS_POR_PAGINA = 48;

/** Página da galeria em que cai o item na posição `posicao` (começando em 1). */
export function paginaDaPosicao(posicao: number, porPagina = FOTOS_POR_PAGINA) {
  return Math.max(1, Math.ceil(posicao / porPagina));
}

/** Leva a página pedida para o intervalo existente: abaixo de 1 vira 1; depois do fim, a última. */
export function limitarPagina(pedida: number, totalPaginas: number) {
  if (!Number.isFinite(pedida)) return 1;
  return Math.min(Math.max(1, Math.trunc(pedida)), Math.max(1, totalPaginas));
}

/**
 * Endereço da galeria com os filtros e a página. A página 1 fica sem `?pagina` (um endereço só
 * por lista). A âncora faz o navegador (e o Next) rolar até ela: `#galeria` (padrão) é o topo da
 * galeria, não da página; `#foto-<id>` é uma foto da grade; `false`, sem âncora.
 */
export function enderecoDaGaleria(
  slug: string,
  filtro: FiltroGaleria = {},
  { pagina = 1, ancora = "galeria" }: { pagina?: number; ancora?: string | false } = {},
) {
  const params = new URLSearchParams();
  if (filtro.hora) params.set("hora", filtro.hora);
  if (filtro.naoIdentificadas) params.set("nao-identificadas", "1");
  if (filtro.pasta) params.set("pasta", filtro.pasta);
  if (pagina > 1) params.set("pagina", String(pagina));
  const busca = params.toString();
  return `/eventos/${slug}${busca ? `?${busca}` : ""}${ancora ? `#${ancora}` : ""}`;
}

export type ItemDaPaginacao = number | "…";

/**
 * Páginas a mostrar: a primeira, a última e `vizinhas` de cada lado da atual, com "…" nos
 * buracos. Um buraco de uma página só mostra o número (reticências não economizariam espaço).
 * Ex.: atual 6 de 80 → 1 … 4 5 6 7 8 … 80.
 */
export function paginasVisiveis(atual: number, total: number, vizinhas = 2): ItemDaPaginacao[] {
  if (total <= 1) return [1];
  const pagina = limitarPagina(atual, total);
  const mostradas = new Set<number>([1, total]);
  for (let p = pagina - vizinhas; p <= pagina + vizinhas; p++) {
    if (p >= 1 && p <= total) mostradas.add(p);
  }
  const ordenadas = [...mostradas].sort((a, b) => a - b);
  const itens: ItemDaPaginacao[] = [];
  let anterior = 0;
  for (const p of ordenadas) {
    if (p - anterior === 2) itens.push(p - 1);
    else if (p - anterior > 2) itens.push("…");
    itens.push(p);
    anterior = p;
  }
  return itens;
}
