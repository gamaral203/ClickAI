// Campo de data e hora do formulário ("2026-10-07T08:00", horário de Brasília) separado em dia e
// hora para o seletor. Nada aqui passa por `new Date("2026-10-07")`: isso é meia-noite em UTC e,
// em UTC-3, cai no dia anterior. O calendário usa datas locais montadas pelos números.

/** "2026-10-07T08:00" → { dia: "2026-10-07", hora: "08:00" }; vazio ou inválido → vazios. */
export function separarCampo(valor: string) {
  const achado = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(valor);
  return achado ? { dia: achado[1], hora: achado[2] } : { dia: "", hora: "" };
}

/** Dia e hora → valor do campo; "" se faltar um dos dois. */
export function juntarCampo(dia: string, hora: string) {
  return dia && hora ? `${dia}T${hora}` : "";
}

/** "2026-10-07" → Date local (meia-noite no fuso do navegador), para o calendário. */
export function diaDoCampo(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/** Date local do calendário → "2026-10-07", pelos números (sem passar por UTC). */
export function campoDoDia(data: Date) {
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

const rotuloDoDia = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10-07" → "qua., 7 de outubro de 2026", igual em qualquer fuso (servidor ou navegador). */
export function dataPorExtenso(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return rotuloDoDia.format(new Date(Date.UTC(a, m - 1, d, 12)));
}

export const MENSAGEM_FIM_ANTES_DO_INICIO = "A data final não pode ser antes do início.";
