import type { Foto } from "@/dados/tipos";

/**
 * Volta da página da foto para a galeria do evento no mesmo ponto em que a pessoa estava.
 *
 * Ao tocar numa foto, a galeria guarda (na aba, em sessionStorage) de onde a pessoa saiu: o
 * evento, a foto e, na galeria principal, as fotos já carregadas. Com isso:
 * - o botão "Voltar" da foto volta no histórico (como o voltar do navegador ou o gesto do
 *   celular) quando a pessoa veio da galeria, em vez de abrir a galeria de novo no topo;
 * - se a galeria for montada do zero na volta (o Next guarda só as últimas rotas com
 *   `<Activity>`, ou a página foi recarregada), ela recupera as fotos carregadas pelo
 *   "Carregar mais" e rola até a foto tocada.
 *
 * Nada aqui é sensível: só ids e URLs públicas de prévia, que já estavam na tela.
 */

const CHAVE = "clicouai:volta-da-galeria";
/** Depois disso a origem guardada é ignorada (a pessoa saiu e voltou muito depois). */
const VALIDADE_MS = 30 * 60 * 1000;

export type OrigemDaFoto = {
  slug: string;
  /** Foto aberta agora (muda com "Anterior" e "Próxima", que substituem a entrada no histórico). */
  fotoAtual: string;
  /** Foto tocada na galeria: é até ela que a galeria rola na volta. */
  fotoClicada: string;
  /** Galeria principal (com filtro): o que restaurar se ela for montada do zero. */
  galeria?: { chave: string; fotos: Foto[]; cursor: string | null };
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
    if (typeof origem?.slug !== "string" || typeof origem.em !== "number") return null;
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
    // Sem espaço ou sem sessionStorage: o "Voltar" cai no link da galeria.
    try {
      guarda?.setItem(
        CHAVE,
        JSON.stringify({ ...origem, galeria: undefined, em: agora } satisfies OrigemDaFoto),
      );
    } catch {}
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
 * A pessoa chegou a esta foto vindo da galeria do evento nesta aba? Então "Voltar" é voltar no
 * histórico. Quem abriu o link compartilhado não tem origem e vai para a galeria por link.
 */
export function veioDaGaleria(
  slug: string,
  fotoId: string,
  agora = Date.now(),
  guarda: Armazenamento | null = armazenamento(),
) {
  const origem = lerOrigem(agora, guarda);
  return origem?.slug === slug && origem.fotoAtual === fotoId;
}
