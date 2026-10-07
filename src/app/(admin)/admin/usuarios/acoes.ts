"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { definirPapelDoUsuario, exigirGestor } from "@/servicos/sessao";

export type EstadoPapel = { ok?: boolean; erro?: string };

const entrada = z.object({
  usuarioId: z.uuid(),
  papel: z.enum(["cliente", "fotografo", "admin"]),
});

/** Muda o papel de um usuário. Só gestores chegam aqui. */
export async function mudarPapelAcao(
  _anterior: EstadoPapel,
  formulario: FormData,
): Promise<EstadoPapel> {
  const gestor = await exigirGestor("/admin/usuarios");
  const dados = entrada.safeParse(Object.fromEntries(formulario));
  if (!dados.success) return { erro: "Escolha um papel válido." };
  const resultado = await definirPapelDoUsuario(gestor, dados.data.usuarioId, dados.data.papel);
  if (resultado === "proprio") return { erro: "Você não pode mudar o seu próprio papel." };
  if (resultado === "inexistente") return { erro: "Usuário não encontrado." };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
