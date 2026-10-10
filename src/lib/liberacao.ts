import { z } from "zod";

import { campoParaIso } from "./datas";

// Liberação das fotos (docs/arquitetura.md, "Liberação das fotos"). Cada foto guarda o próprio
// horário (`fotos.liberar_em`): nulo aguarda o "Liberar agora" do dono; um horário no passado já
// aparece; no futuro, aparece sozinha nesse minuto, porque toda consulta pública compara com a
// hora da requisição. Aqui ficam só as regras puras, usadas no servidor e nas telas.

export type ModoLiberacao = "automatica" | "manual" | "agendada";
export type EstadoLiberacao = "liberada" | "agendada" | "manual";

/** Liberação gravada numa foto: o modo do lote e quando ela passa a aparecer. */
export type LiberacaoDaFoto = { liberacao: ModoLiberacao; liberarEm: Date | null };

/** Estado de uma foto em `agora`: liberada, agendada para depois ou aguardando o dono. */
export function estadoDaLiberacao(liberarEm: string | Date | null, agora: number): EstadoLiberacao {
  if (liberarEm === null) return "manual";
  return new Date(liberarEm).getTime() <= agora ? "liberada" : "agendada";
}

/** Escolha de liberação de um lote, como chega do navegador (horário de Brasília no campo). */
export const escolhaLiberacaoSchema = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("automatica") }),
  z.object({ modo: z.literal("manual") }),
  z.object({
    modo: z.literal("agendada"),
    /** "2026-10-10T16:00", o valor do <input type="datetime-local">, em Brasília. */
    em: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  }),
]);
export type EscolhaLiberacao = z.infer<typeof escolhaLiberacaoSchema>;

/** Campo de Brasília → instante (UTC), ou `null` se inválido. 16:00 em Brasília = 19:00 UTC. */
export function instanteDoCampo(campo: string): Date | null {
  const iso = campoParaIso(campo);
  return iso ? new Date(iso) : null;
}

/**
 * Liberação gravada nas fotos de um lote, calculada no servidor com o relógio dele.
 * - Sem escolha própria (ou enviada por colaborador), vale o padrão do evento: quem decide é o
 *   dono. No padrão agendado sem horário, a foto fica aguardando (manual).
 * - Automática: libera no momento do envio (a foto aparece assim que fica pronta).
 * - Agendada: o horário escolhido. Um horário que passa durante um envio longo continua valendo
 *   (as fotos aparecem assim que ficam prontas); a tela não deixa começar com horário passado.
 */
export function liberacaoDoLote(
  padrao: { liberacao: ModoLiberacao; liberadoEm: string | null },
  escolha: EscolhaLiberacao | null,
  agora: number,
): LiberacaoDaFoto {
  if (!escolha) {
    if (padrao.liberacao === "automatica")
      return { liberacao: "automatica", liberarEm: new Date(agora) };
    if (padrao.liberacao === "agendada" && padrao.liberadoEm) {
      return { liberacao: "agendada", liberarEm: new Date(padrao.liberadoEm) };
    }
    return { liberacao: "manual", liberarEm: null };
  }
  if (escolha.modo === "automatica") return { liberacao: "automatica", liberarEm: new Date(agora) };
  if (escolha.modo === "manual") return { liberacao: "manual", liberarEm: null };
  const em = instanteDoCampo(escolha.em);
  return em ? { liberacao: "agendada", liberarEm: em } : { liberacao: "manual", liberarEm: null };
}

const FUSO = "America/Sao_Paulo";
const horaMinuto = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: FUSO,
});
const diaMes = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: FUSO,
});

/** "16:00 de 10/10", no horário de Brasília. */
export function formatarAgendamento(iso: string) {
  const data = new Date(iso);
  return `${horaMinuto.format(data)} de ${diaMes.format(data)}`;
}

/** "16:00", no horário de Brasília. */
export function formatarHora(iso: string) {
  return horaMinuto.format(new Date(iso));
}

/** Padrão de liberação do evento, em texto, para quem envia sem poder trocar (colaborador). */
export function descreverPadrao(modo: ModoLiberacao, liberadoEm: string | null, agora: number) {
  if (modo === "automatica") return "assim que cada foto fica pronta (automática)";
  if (modo === "agendada" && liberadoEm) {
    return new Date(liberadoEm).getTime() <= agora
      ? "assim que cada foto fica pronta (o horário agendado já passou)"
      : `às ${formatarAgendamento(liberadoEm)} (agendada)`;
  }
  return "quando o dono do evento liberar (manual)";
}

/** Texto do estado para o painel. */
export function rotuloDaLiberacao(estado: EstadoLiberacao, liberarEm: string | null) {
  if (estado === "liberada") return "Liberada";
  if (estado === "agendada" && liberarEm) return `Agendada para ${formatarAgendamento(liberarEm)}`;
  return "Aguardando liberação (manual)";
}
