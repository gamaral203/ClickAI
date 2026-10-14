"use server";

import { revalidatePath } from "next/cache";

import { alternarManutencao } from "@/servicos/manutencao";
import { exigirGestor } from "@/servicos/sessao";

export type EstadoManutencao = { ok?: boolean; erro?: string };

/**
 * Liga ou desliga o modo de manutenção (docs/arquitetura.md, "Modo de manutenção"). Só gestores
 * chegam aqui. O serviço troca o cache do estado na hora (src/dados/manutencao.ts) e o
 * revalidatePath manda o navegador do gestor refazer as páginas (com a faixa no topo).
 */
export async function alternarManutencaoAcao(dados: {
  ativa: boolean;
  mensagem?: string | null;
}): Promise<EstadoManutencao> {
  const gestor = await exigirGestor("/admin");
  const resultado = await alternarManutencao(gestor, dados);
  if ("erro" in resultado) return { erro: resultado.erro };
  revalidatePath("/", "layout");
  return { ok: true };
}
