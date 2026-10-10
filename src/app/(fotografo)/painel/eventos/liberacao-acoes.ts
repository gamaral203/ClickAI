"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mudarLiberacao, type MudancaLiberacao } from "@/dados";
import { instanteDoCampo } from "@/lib/liberacao";
import { exigirFotografo } from "@/servicos/sessao";

// Liberação das fotos pelo dono do evento (docs/arquitetura.md, "Liberação das fotos"). Server
// Actions são endpoints públicos: tudo é validado aqui, o horário é calculado com o relógio do
// servidor e a camada de dados só mexe em fotos de evento do fotógrafo logado (sem IDOR).

const entrada = z.object({
  eventoId: z.uuid(),
  /** Fotos escolhidas na grade; sem a lista, vale para todas as ainda não liberadas. */
  fotoIds: z.array(z.uuid()).min(1).max(5000).optional(),
  mudanca: z.discriminatedUnion("acao", [
    z.object({ acao: z.literal("liberar") }),
    z.object({ acao: z.literal("cancelar") }),
    z.object({
      acao: z.literal("agendar"),
      /** "2026-10-10T16:00", horário de Brasília. */
      em: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    }),
  ]),
});

export type ResultadoLiberacao = {
  erro?: string;
  /** O horário escolhido já passou: a tela oferece "Liberar agora". */
  horarioPassado?: boolean;
  /** Quantas fotos mudaram. */
  alteradas?: number;
};

/**
 * Libera agora, agenda (ou reagenda) e cancela o agendamento das fotos ainda não liberadas de um
 * evento do fotógrafo logado. Horário no passado não é aceito para agendar.
 */
export async function mudarLiberacaoAcao(dados: unknown): Promise<ResultadoLiberacao> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const validacao = entrada.safeParse(dados);
  if (!validacao.success) return { erro: "Não foi possível entender o pedido. Atualize a página." };
  const { eventoId, fotoIds, mudanca } = validacao.data;
  const agora = Date.now();

  let paraGravar: MudancaLiberacao;
  if (mudanca.acao === "agendar") {
    const em = instanteDoCampo(mudanca.em);
    if (!em) return { erro: "Informe a data e a hora da liberação." };
    if (em.getTime() <= agora) {
      return {
        erro: "Esse horário já passou. Escolha um horário no futuro ou libere agora.",
        horarioPassado: true,
      };
    }
    paraGravar = { acao: "agendar", em };
  } else {
    paraGravar = mudanca;
  }

  const alteradas = await mudarLiberacao(eventoId, conta.id, paraGravar, fotoIds ?? null, agora);
  if (alteradas === null) return { erro: "Evento não encontrado." };
  revalidatePath(`/painel/eventos/${eventoId}`);
  revalidatePath("/painel/colaboracoes");
  return { alteradas };
}
