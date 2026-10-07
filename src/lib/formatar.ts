const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarPreco(centavos: number) {
  return reais.format(centavos / 100);
}

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Formata uma data AAAA-MM-DD sem deslocar o dia pelo fuso horário. */
export function formatarData(data: string) {
  return dataLonga.format(new Date(`${data}T00:00:00Z`));
}
