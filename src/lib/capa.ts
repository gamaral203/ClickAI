/** Pode virar capa do evento: foto (não vídeo; a prévia do vídeo é o próprio vídeo) já pronta. */
export function podeSerCapa(item: { tipo?: "foto" | "video"; status: string }) {
  return item.status === "pronta" && (item.tipo ?? "foto") === "foto";
}

/**
 * Texto do cartão público sem capa. Com senha, "Fotos protegidas" (mesmo enquanto aguarda a
 * liberação); senão, a liberação que ainda vem.
 */
export function textoSemCapa(evento: {
  visibilidade: string;
  situacaoGaleria: { tipo: string };
}): string {
  if (evento.visibilidade === "senha") return "Fotos protegidas";
  return "Fotos em breve";
}

/**
 * Por que a capa que o dono vê no painel ainda não aparece no site, ou `null` se aparece (ou o
 * evento não está publicado, quando nada aparece). A capa de foto só vale com a galeria aberta
 * (src/dados/index.ts, `resumir`); a imagem enviada vale sempre, menos com senha.
 */
export function motivoDaCapaForaDoSite(evento: {
  status: string;
  visibilidade: string;
  /** Há imagem enviada pelo dono (`eventos.capa`). */
  capaEnviada: boolean;
  /** Fotos prontas já liberadas (ver `resumoDaLiberacao`). */
  liberadas: number;
}): string | null {
  if (evento.status !== "publicado") return null;
  if (evento.visibilidade === "senha") return "o evento tem senha";
  if (evento.capaEnviada) return null;
  if (evento.liberadas === 0) return "nenhuma foto foi liberada ainda";
  return null;
}
