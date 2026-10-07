"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  iniciarAnalise,
  marcarImprocedente,
  marcarProcedente,
  type ResultadoModeracao,
} from "@/servicos/moderacao";
import { exigirEquipe } from "@/servicos/sessao";

// Decisões sobre denúncias: só o gestor decide; o atendente vê e acompanha.

const entrada = z.object({
  id: z.uuid(),
  acao: z.enum(["analisar", "analisar_e_tirar_do_ar", "procedente", "improcedente"]),
});

export async function moderarAcao(id: string, acao: string): Promise<ResultadoModeracao> {
  const usuario = await exigirEquipe("/admin/denuncias", true);
  const dados = entrada.safeParse({ id, acao });
  if (!dados.success) return { ok: false, erro: "Ação inválida." };
  const executar = {
    analisar: () => iniciarAnalise(dados.data.id, usuario.id, false),
    analisar_e_tirar_do_ar: () => iniciarAnalise(dados.data.id, usuario.id, true),
    procedente: () => marcarProcedente(dados.data.id, usuario.id),
    improcedente: () => marcarImprocedente(dados.data.id, usuario.id),
  }[dados.data.acao];
  const resultado = await executar();
  revalidatePath("/admin/denuncias", "layout");
  return resultado;
}
