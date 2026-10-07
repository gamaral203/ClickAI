/**
 * "19,90", "19.90", "R$ 19,90", "1.234,5" ou "20" em centavos (1990, 1990, 123450, 2000). Devolve `null` se
 * não for um valor válido. Nunca usa ponto flutuante na conta.
 */
export function reaisParaCentavos(texto: string): number | null {
  let limpo = texto.replace(/R\$|\s/g, "");
  // Sem vírgula e com ponto seguido de 1 ou 2 dígitos no fim ("19.90"): o ponto é o decimal.
  if (!limpo.includes(",") && /^\d+\.\d{1,2}$/.test(limpo)) limpo = limpo.replace(".", ",");
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  const inteiros = Number(m[1].replace(/\./g, ""));
  const centavos = Number((m[2] ?? "0").padEnd(2, "0"));
  return inteiros * 100 + centavos;
}

/** 1990 → "19,90" (para preencher campos de formulário). */
export function centavosParaCampo(centavos: number) {
  return `${Math.floor(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;
}
