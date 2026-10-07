"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { formatarPreco } from "@/lib/formatar";
import { solicitarSaque } from "@/servicos/saques";
import { exigirFotografo } from "@/servicos/sessao";

export type EstadoSaque = { ok?: string; erro?: string };

const MOTIVOS = {
  sem_chave: "Confirme sua chave Pix em Perfil e recebimento antes de sacar.",
  saque_em_andamento: "Já existe um saque em andamento. Espere ele terminar para pedir outro.",
  abaixo_do_minimo: "O valor a receber precisa ser de pelo menos R$ 1,00.",
  conflito: "Outro saque foi pedido ao mesmo tempo. Atualize a página e confira.",
  falhou: "Não foi possível fazer o saque agora. Tente de novo em alguns minutos.",
};

const entrada = z.object({ tipo: z.enum(["normal", "antecipado"]) });

/**
 * Saque de todo o saldo sacável. O valor nunca vem do navegador: o servidor calcula a partir
 * dos lançamentos do fotógrafo logado.
 */
export async function solicitarSaqueAcao(
  _anterior: EstadoSaque,
  formulario: FormData,
): Promise<EstadoSaque> {
  const { conta } = await exigirFotografo("/painel/vendas");
  const dados = entrada.safeParse(Object.fromEntries(formulario));
  if (!dados.success) return { erro: MOTIVOS.falhou };

  const resultado = await solicitarSaque(conta, dados.data.tipo === "antecipado");
  revalidatePath("/painel/vendas");
  if (!resultado.ok) return { erro: MOTIVOS[resultado.motivo] };
  return {
    ok: `Saque de ${formatarPreco(resultado.saque.liquidoCentavos)} pedido. O Pix vai para a sua chave cadastrada.`,
  };
}
