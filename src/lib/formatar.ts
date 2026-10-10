const FUSO = "America/Sao_Paulo";

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarPreco(centavos: number) {
  return reais.format(centavos / 100);
}

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: FUSO,
});

const dataEHora = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO,
});

/** "27 de setembro de 2026", no horário de Brasília. Recebe data ISO com hora e fuso. */
export function formatarData(iso: string) {
  return dataLonga.format(new Date(iso));
}

/** "12 de dezembro de 2026 às 18:00", no horário de Brasília. */
export function formatarDataEHora(iso: string) {
  return dataEHora.format(new Date(iso)).replace(",", " às");
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO,
});

/** "12/12/26 18:00" (ou só "12/12/26" com `hora: false`): para tabelas, onde a data por extenso não cabe. */
export function formatarDataCurta(iso: string, { hora = true } = {}) {
  const texto = dataCurta.format(new Date(iso)).replace(",", "");
  return hora ? texto : texto.slice(0, 8);
}

const porcentagem = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** 0.125 → "12,5%". `null` (sem base para calcular, como conversão sem visitas) vira "—". */
export function formatarPorcentagem(fracao: number | null) {
  return fracao === null ? "—" : porcentagem.format(fracao);
}

const compacto = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * Preço curto para selos e cartões: "R$ 700", "R$ 2,5 mil", "R$ 10 mil", "R$ 1,2 mi". Sem
 * centavos e com no máximo uma casa decimal, sempre arredondando para baixo (o selo nunca mostra
 * mais do que foi vendido: R$ 9.999,99 é "R$ 9,9 mil", não "R$ 10 mil").
 */
export function formatarPrecoCompacto(centavos: number) {
  const sinal = centavos < 0 ? "-" : "";
  const reaisInteiros = Math.floor(Math.abs(centavos) / 100);
  if (reaisInteiros < 1_000) return `${sinal}R$ ${reaisInteiros}`;
  if (reaisInteiros < 1_000_000) {
    return `${sinal}R$ ${compacto.format(Math.floor(reaisInteiros / 100) / 10)} mil`;
  }
  return `${sinal}R$ ${compacto.format(Math.floor(reaisInteiros / 100_000) / 10)} mi`;
}
