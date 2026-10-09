// Metas de vendas do fotógrafo: a cada marca de faturamento (R$ 10 mil, 25 mil...), ele ganha um
// quadro com a marca do ClicouAí. As premiações físicas ficam para depois; por enquanto, o quadro
// aparece no painel. Sem dependências: roda no servidor e no navegador.

export type Meta = {
  /** Valor da meta, em centavos. */
  valorCentavos: number;
  /** Rótulo curto do quadro ("10K", "1M"). */
  rotulo: string;
};

export const METAS: Meta[] = [
  { valorCentavos: 10_000_00, rotulo: "10K" },
  { valorCentavos: 25_000_00, rotulo: "25K" },
  { valorCentavos: 50_000_00, rotulo: "50K" },
  { valorCentavos: 100_000_00, rotulo: "100K" },
  { valorCentavos: 500_000_00, rotulo: "500K" },
  { valorCentavos: 1_000_000_00, rotulo: "1M" },
];

export type SituacaoMetas = {
  /** Total vendido até agora, em centavos. */
  totalCentavos: number;
  conquistadas: Meta[];
  /** A próxima meta; `null` depois de bater todas. */
  proxima: Meta | null;
  /** Nome do nível: a última meta batida, ou "Iniciante". */
  nivel: string;
  /** De 0 a 100: quanto do caminho até a próxima meta já foi feito (a partir de zero). */
  progressoPct: number;
  /** Quanto falta para a próxima meta, em centavos (0 depois de bater todas). */
  faltaCentavos: number;
};

export function situacaoDasMetas(totalCentavos: number): SituacaoMetas {
  const total = Math.max(0, Math.round(totalCentavos));
  const conquistadas = METAS.filter((m) => total >= m.valorCentavos);
  const proxima = METAS.find((m) => total < m.valorCentavos) ?? null;
  return {
    totalCentavos: total,
    conquistadas,
    proxima,
    nivel: conquistadas.at(-1)?.rotulo ?? "Iniciante",
    progressoPct: proxima ? Math.floor((total / proxima.valorCentavos) * 100) : 100,
    faltaCentavos: proxima ? proxima.valorCentavos - total : 0,
  };
}
