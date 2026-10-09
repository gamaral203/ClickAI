// Recepção do painel do fotógrafo: qual mensagem (e qual emoji) mostrar, a partir das vendas
// reais dele. Compara o fotógrafo só com ele mesmo (últimos 7 dias contra os 7 anteriores),
// nunca com outros perfis.

export type Humor = "novo" | "alta" | "baixo";

export type EntradaRecepcao = {
  /** Eventos publicados do fotógrafo. */
  publicados: number;
  /** Pedidos pagos nos últimos 7 dias. */
  pedidosSemana: number;
  /** Pedidos pagos nos 7 dias anteriores a esses. */
  pedidosSemanaAnterior: number;
};

export function humorDoPainel(e: EntradaRecepcao): Humor {
  if (e.publicados === 0) return "novo";
  if (e.pedidosSemana > 0 && e.pedidosSemana >= e.pedidosSemanaAnterior) return "alta";
  return "baixo";
}

/** Soma dos pedidos da série diária (do mais antigo para hoje): últimos 7 e os 7 anteriores. */
export function pedidosPorSemana(serie: { pedidos: number }[]) {
  const soma = (lista: { pedidos: number }[]) => lista.reduce((s, d) => s + d.pedidos, 0);
  return {
    pedidosSemana: soma(serie.slice(-7)),
    pedidosSemanaAnterior: soma(serie.slice(-14, -7)),
  };
}
