// Período do evento: a data de início é obrigatória e a final, opcional. Sem data final, o
// evento vale só pelo dia de início, em todo lugar (exibição, filtro por dia, ordenação):
// é o COALESCE(fim_em, inicio_em) das consultas.

import { z } from "zod";

import { campoParaIso } from "./datas";
import { diaEmBrasilia } from "./formatar";

export { MENSAGEM_FIM_ANTES_DO_INICIO } from "./campo-data";

/** Campo obrigatório no formato do formulário ("2026-10-07T08:00") → ISO com fuso de Brasília. */
export const campoDataObrigatoria = (mensagem: string) =>
  z.string(mensagem).transform((v, ctx) => {
    const iso = campoParaIso(v);
    if (!iso) ctx.addIssue({ code: "custom", message: mensagem });
    return iso ?? "";
  });

/** Campo que pode vir em branco (vira `null`); preenchido, segue o mesmo formato do obrigatório. */
export const campoDataOpcional = (mensagem: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const iso = campoParaIso(v.trim());
      if (!iso) ctx.addIssue({ code: "custom", message: mensagem });
      return iso;
    });

/** Campos de data do formulário do evento (criar, editar). */
export const camposDoPeriodo = {
  inicioEm: campoDataObrigatoria("Informe a data e a hora de início."),
  fimEm: campoDataOpcional("Data final inválida. Escolha o dia e a hora de novo."),
};

/**
 * A data final, quando existe, não pode ser antes do início. Os dois vêm de `campoParaIso`, no
 * mesmo formato e fuso, então a comparação de texto é a mesma do tempo.
 */
export function periodoValido(d: { inicioEm: string; fimEm: string | null }) {
  return !d.inicioEm || !d.fimEm || d.fimEm >= d.inicioEm;
}

/** Instante em que o evento termina: o fim, ou o início quando não há data final. */
export function fimOuInicio(evento: { inicioEm: string; fimEm: string | null }) {
  return evento.fimEm ?? evento.inicioEm;
}

/** O evento acontece no dia (AAAA-MM-DD, de Brasília)? Sem data final, só o dia de início. */
export function eventoNoDia(evento: { inicioEm: string; fimEm: string | null }, dia: string) {
  return diaEmBrasilia(evento.inicioEm) <= dia && dia <= diaEmBrasilia(fimOuInicio(evento));
}
