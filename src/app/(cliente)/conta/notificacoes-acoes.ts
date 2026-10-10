"use server";

import { z } from "zod";

import { removerInscricaoPush, salvarInscricaoPush } from "@/dados";
import { usuarioAtual } from "@/servicos/sessao";

// Ativar e desativar as notificações do navegador neste aparelho. Só o usuário logado, e só os
// campos da inscrição (o endpoint precisa ser https, de um serviço de push do navegador).

const inscricao = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(300),
    auth: z.string().min(10).max(100),
  }),
});

export async function ativarNotificacoesAcao(dados: unknown): Promise<{ ok: boolean }> {
  const usuario = await usuarioAtual();
  if (!usuario) return { ok: false };
  const valido = inscricao.safeParse(dados);
  if (!valido.success) return { ok: false };
  await salvarInscricaoPush(usuario.id, {
    endpoint: valido.data.endpoint,
    p256dh: valido.data.keys.p256dh,
    auth: valido.data.keys.auth,
  });
  return { ok: true };
}

export async function desativarNotificacoesAcao(endpoint: unknown): Promise<{ ok: boolean }> {
  const usuario = await usuarioAtual();
  if (!usuario || typeof endpoint !== "string" || endpoint.length > 1000) return { ok: false };
  await removerInscricaoPush(usuario.id, endpoint);
  return { ok: true };
}
