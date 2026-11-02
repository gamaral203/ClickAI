// Previsão do "N processando" da grade do painel. É estimativa: usa o ritmo que a tela observou
// entre as consultas e, antes disso, o ritmo medido em produção com a fila por minuto.

/** Fotos por minuto de uma execução da fila, sem o navegador ajudando (medido em produção). */
export const RITMO_PADRAO_POR_MINUTO = 70;

/** Tempo restante em texto: "menos de 1 min", "cerca de 18 min", "cerca de 2 h". */
export function textoDaPrevisao(faltam: number, porMinuto = RITMO_PADRAO_POR_MINUTO): string {
  const ritmo = porMinuto > 0 ? porMinuto : RITMO_PADRAO_POR_MINUTO;
  const minutos = Math.ceil(faltam / ritmo);
  if (minutos <= 1) return "menos de 1 min";
  if (minutos < 60) return `cerca de ${minutos} min`;
  const horas = Math.round(minutos / 30) / 2;
  return `cerca de ${String(horas).replace(".", ",")} h`;
}

/** Ritmo observado entre duas consultas, em fotos por minuto; `null` se nada mudou. */
export function ritmoObservado(concluidas: number, passouMs: number): number | null {
  if (concluidas <= 0 || passouMs <= 0) return null;
  return (concluidas * 60_000) / passouMs;
}
