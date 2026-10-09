// Limites do envio de fotos, os mesmos no navegador (src/components/painel/envio-fotos.tsx) e no
// servidor (src/servicos/envios.ts). Não há limite de quantidade de fotos por envio nem por
// evento: o lote só divide a seleção em chamadas pequenas.

/** Tamanho máximo de cada foto (conferido no navegador, na URL assinada e no arquivo recebido). */
export const LIMITE_FOTO_BYTES = 30 * 1024 * 1024;

/**
 * Fotos por chamada de iniciarEnvio. Não é limite do envio: o navegador divide a seleção em
 * lotes deste tamanho sozinho. Só mantém cada chamada pequena (corpo, tempo e URLs assinadas).
 */
export const FOTOS_POR_LOTE = 50;
