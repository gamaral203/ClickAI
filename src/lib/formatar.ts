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

const porcentagem = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** 0.125 → "12,5%". `null` (sem base para calcular, como conversão sem visitas) vira "—". */
export function formatarPorcentagem(fracao: number | null) {
  return fracao === null ? "—" : porcentagem.format(fracao);
}
