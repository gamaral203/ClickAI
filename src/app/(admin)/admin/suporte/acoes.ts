"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mudarStatusSugestao, registrarRespostaDaEquipe } from "@/dados";
import { avisarRespostaDeSuporte } from "@/servicos/avisos-suporte";
import { usuarioAtual } from "@/servicos/sessao";

// Respostas do chat de ajuda e status das sugestões: só a gestão.

async function eGestor() {
  const usuario = await usuarioAtual();
  return usuario?.papel === "admin";
}

const resposta = z.object({
  conversaId: z.uuid(),
  texto: z.string().trim().min(1, "Escreva a resposta.").max(4000, "Até 4.000 caracteres."),
});

export async function responderSuporteAcao(dados: unknown): Promise<{ erro?: string }> {
  if (!(await eGestor())) return { erro: "Só a gestão responde o chat." };
  const valido = resposta.safeParse(dados);
  if (!valido.success) return { erro: valido.error.issues[0]?.message ?? "Confira a resposta." };
  const { conversaId, texto } = valido.data;
  const conversa = await registrarRespostaDaEquipe(conversaId, texto);
  if (!conversa) return { erro: "Conversa não encontrada." };
  await avisarRespostaDeSuporte(conversa, texto);
  revalidatePath("/admin/suporte");
  revalidatePath(`/admin/suporte/${conversaId}`);
  return {};
}

const status = z.object({
  id: z.uuid(),
  status: z.enum(["nova", "em_analise", "feita", "descartada"]),
});

export async function mudarStatusSugestaoAcao(dados: unknown): Promise<{ erro?: string }> {
  if (!(await eGestor())) return { erro: "Só a gestão muda a sugestão." };
  const valido = status.safeParse(dados);
  if (!valido.success) return { erro: "Sugestão inválida." };
  if (!(await mudarStatusSugestao(valido.data.id, valido.data.status))) {
    return { erro: "Sugestão não encontrada." };
  }
  revalidatePath("/admin/sugestoes");
  return {};
}
