// O formulário usa <input type="datetime-local">, que não tem fuso. Todo horário digitado é
// de Brasília (UTC-3, sem horário de verão desde 2019).

const FUSO_BRASILIA = "-03:00";

/** "2026-09-27T07:00" (campo) → "2026-09-27T07:00:00-03:00". `null` se inválido. */
export function campoParaIso(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const iso = `${valor}:00${FUSO_BRASILIA}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** ISO com qualquer fuso → "2026-09-27T07:00" no horário de Brasília (para o campo). */
export function isoParaCampo(iso: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
