"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { buscarSaqueDoAdmin, mudarStatusSaque, soltarLancamentosDoSaque } from "@/dados";
import { avisarSaquePago } from "@/servicos/avisos-saque";
import { exigirGestor } from "@/servicos/sessao";

// Baixa manual dos saques (enquanto o saque automático pelo gateway não está liberado): a gestão
// faz o Pix pelo app do banco e marca aqui. Só sai de `processando`, nunca volta.

const id = z.uuid();

/** O Pix foi feito: o saque vira `pago` e o fotógrafo é avisado. */
export async function marcarSaquePagoAcao(saqueId: string): Promise<{ erro?: string }> {
  await exigirGestor("/admin/saques");
  if (!id.safeParse(saqueId).success) return { erro: "Saque não encontrado." };
  const saque = await buscarSaqueDoAdmin(saqueId);
  if (!saque) return { erro: "Saque não encontrado." };
  const mudou = await mudarStatusSaque(saqueId, "processando", "pago", {
    pagoEm: new Date().toISOString(),
  });
  if (!mudou) return { erro: "Este saque já foi resolvido. Atualize a página." };
  await avisarSaquePago(saque);
  revalidatePath("/admin/saques");
  return {};
}

/** O Pix não vai ser feito (chave com problema, por exemplo): o saldo volta ao fotógrafo. */
export async function marcarSaqueNaoRealizadoAcao(saqueId: string): Promise<{ erro?: string }> {
  await exigirGestor("/admin/saques");
  if (!id.safeParse(saqueId).success) return { erro: "Saque não encontrado." };
  const mudou = await mudarStatusSaque(saqueId, "processando", "falhou");
  if (!mudou) return { erro: "Este saque já foi resolvido. Atualize a página." };
  await soltarLancamentosDoSaque(saqueId);
  revalidatePath("/admin/saques");
  return {};
}
