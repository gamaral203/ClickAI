// Moldura do evento (docs/arquitetura.md, "Moldura do evento"): medidas, limites e o que pode ser
// feito no navegador e no servidor sem tocar no banco. A conferência da imagem e a composição
// com o Sharp ficam em src/servicos/molduras.ts.

export const FORMATOS_MOLDURA = ["story", "feed"] as const;
export type FormatoMoldura = (typeof FORMATOS_MOLDURA)[number];

/** Medidas exatas da moldura e da imagem baixada com ela (as do Instagram). */
export const MEDIDAS_MOLDURA: Record<
  FormatoMoldura,
  { largura: number; altura: number; rotulo: string }
> = {
  story: { largura: 1080, altura: 1920, rotulo: "Story" },
  feed: { largura: 1080, altura: 1350, rotulo: "Feed" },
};

/** Teto do PNG enviado (conferido no navegador, na assinatura do envio e de novo ao confirmar). */
export const LIMITE_MOLDURA_BYTES = 5 * 1024 * 1024;
export const LIMITE_MOLDURA_TEXTO = "5 MB";

/**
 * Parte mínima da moldura que precisa ser transparente (onde a foto aparece). Abaixo disso, a
 * arte cobriria a foto: provavelmente um PNG sem a janela recortada.
 */
export const TRANSPARENCIA_MINIMA = 0.1;

/**
 * Área segura do modelo para o designer: fora dela, no story, ficam o nome do perfil e a caixa
 * de resposta do Instagram; no feed, o corte da grade (1:1 no perfil). Textos e logos dentro.
 */
export const AREA_SEGURA: Record<FormatoMoldura, { topo: number; base: number; lados: number }> = {
  story: { topo: 250, base: 340, lados: 64 },
  feed: { topo: 135, base: 135, lados: 54 },
};

/** Faixa sugerida para a arte no modelo (o resto é a janela da foto). */
export const FAIXA_SUGERIDA: Record<FormatoMoldura, { topo: number; base: number; lados: number }> =
  {
    story: { topo: 300, base: 420, lados: 48 },
    feed: { topo: 150, base: 190, lados: 40 },
  };

export function ehFormatoMoldura(valor: unknown): valor is FormatoMoldura {
  return FORMATOS_MOLDURA.includes(valor as FormatoMoldura);
}

/** Nome do arquivo baixado com a moldura: "corrida-x-IMG_4000-story.jpg". */
export function nomeComMoldura(nomeOriginal: string, formato: FormatoMoldura) {
  const base = nomeOriginal.replace(/\.[^.]+$/, "");
  return `${base}-${formato}.jpg`;
}

/** Endereço do download com moldura de um item comprado (com o token, quando há). */
export function linkComMoldura(itemId: string, formato: FormatoMoldura, token: string | null) {
  const busca = new URLSearchParams({ formato });
  if (token) busca.set("token", token);
  return `/api/compras/moldura/${itemId}?${busca}`;
}
