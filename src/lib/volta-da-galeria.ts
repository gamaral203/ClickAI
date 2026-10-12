/**
 * Volta da página da foto para a galeria do evento no mesmo ponto em que a pessoa estava.
 *
 * A página da galeria fica na URL (`?pagina=N`), então o histórico já sabe para onde voltar. Ao
 * tocar numa foto, a galeria guarda (na aba, em sessionStorage) só de onde a pessoa saiu: o
 * evento, a foto aberta e os ids das fotos que estavam na tela. Com isso:
 * - o botão "Voltar" da foto volta no histórico (como o voltar do navegador ou o gesto do
 *   celular) quando a foto aberta ainda é uma das que estavam na tela, em vez de abrir a
 *   galeria de novo no topo;
 * - se "Anterior"/"Próxima" levaram para uma foto de outra página (ou a foto foi aberta pelo
 *   link direto), "Voltar" vai pelo link para a página da galeria em que a foto está;
 * - na volta, a galeria rola até a foto que estava aberta, se ela estiver na página.
 *
 * Nada aqui é sensível: só ids de fotos públicas, que já estavam na tela.
 */

const CHAVE = "clicouai:volta-da-galeria";
/** Depois disso a origem guardada é ignorada (a pessoa saiu e voltou muito depois). */
const VALIDADE_MS = 30 * 60 * 1000;

export type OrigemDaFoto = {
  slug: string;
  /** Foto aberta agora (muda com "Anterior" e "Próxima", que substituem a entrada no histórico). */
  fotoAtual: string;
  /** Fotos que estavam na tela da galeria (a página ou o resultado da busca). */
  ids: string[];
  em: number;
};

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function armazenamento(): Armazenamento | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function lerOrigem(
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
): OrigemDaFoto | null {
  try {
    const bruto = guarda?.getItem(CHAVE);
    if (!bruto) return null;
    const origem = JSON.parse(bruto) as OrigemDaFoto;
    if (
      typeof origem?.slug !== "string" ||
      typeof origem.fotoAtual !== "string" ||
      !Array.isArray(origem.ids) ||
      typeof origem.em !== "number"
    ) {
      return null;
    }
    if (agora - origem.em > VALIDADE_MS) return null;
    return origem;
  } catch {
    return null;
  }
}

export function guardarOrigem(
  origem: Omit<OrigemDaFoto, "em">,
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
) {
  try {
    guarda?.setItem(CHAVE, JSON.stringify({ ...origem, em: agora }));
  } catch {
    // Sem espaço ou sem sessionStorage: o "Voltar" cai no link da página da galeria.
  }
}

export function esquecerOrigem(guarda: Armazenamento | null = armazenamento()) {
  try {
    guarda?.removeItem(CHAVE);
  } catch {}
}

/** "Anterior"/"Próxima" trocam a foto aberta sem criar entrada nova no histórico. */
export function trocarFotoAtual(
  slug: string,
  de: string,
  para: string,
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
) {
  const origem = lerOrigem(agora, guarda);
  if (!origem || origem.slug !== slug || origem.fotoAtual !== de) return;
  guardarOrigem({ ...origem, fotoAtual: para }, agora, guarda);
}

/**
 * Voltar no histórico leva de volta à galeria com esta foto na tela? Só quando a pessoa chegou
 * aqui pela galeria do evento nesta aba e a foto aberta é uma das que estavam na tela. Quem abriu
 * o link compartilhado, ou atravessou para outra página com "Anterior"/"Próxima", vai pelo link.
 */
export function veioDaGaleria(
  slug: string,
  fotoId: string,
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
) {
  const origem = lerOrigem(agora, guarda);
  return origem?.slug === slug && origem.fotoAtual === fotoId && origem.ids.includes(fotoId);
}

/**
 * Na galeria que acaba de aparecer: a foto até a qual rolar (a que estava aberta), se ela está
 * entre as fotos na tela. Consome a origem nesse caso; se não, deixa-a para outra lista da
 * mesma página (a busca e a galeria aparecem juntas).
 */
export function fotoParaRolar(
  slug: string,
  idsNaTela: string[],
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
): string | null {
  const origem = lerOrigem(agora, guarda);
  if (!origem || origem.slug !== slug || !idsNaTela.includes(origem.fotoAtual)) return null;
  esquecerOrigem(guarda);
  return origem.fotoAtual;
}
