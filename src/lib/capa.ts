/** Pode virar capa do evento: foto (não vídeo; a prévia do vídeo é o próprio vídeo) já pronta. */
export function podeSerCapa(item: { tipo?: "foto" | "video"; status: string }) {
  return item.status === "pronta" && (item.tipo ?? "foto") === "foto";
}
