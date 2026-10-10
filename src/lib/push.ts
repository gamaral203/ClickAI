// Notificações do navegador (Web Push). As chaves VAPID identificam o ClicouAí para os serviços de
// push do navegador: a pública vai ao navegador (NEXT_PUBLIC_VAPID_PUBLIC_KEY), a privada fica
// só no servidor (VAPID_PRIVATE_KEY). Gerar com: npx web-push generate-vapid-keys.
// Sem as chaves, nada é enviado (e o botão de ativar não aparece).

import "server-only";

import webpush from "web-push";

import { apagarInscricaoPush, inscricoesDosUsuarios } from "@/dados";

export type AvisoPush = { titulo: string; corpo: string; url: string };

export function pushConfigurado() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Manda o aviso a todos os aparelhos em que esses usuários ativaram as notificações. Nunca lança:
 * uma notificação que falha não pode desfazer uma venda ou um saque. Inscrição vencida é apagada.
 */
export async function enviarPush(usuarioIds: string[], aviso: AvisoPush): Promise<number> {
  if (!pushConfigurado() || usuarioIds.length === 0) return 0;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_ASSUNTO || "mailto:contato@clicouai.com.br",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    const inscricoes = await inscricoesDosUsuarios(usuarioIds);
    const corpo = JSON.stringify(aviso);
    let enviados = 0;
    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            corpo,
            { TTL: 24 * 60 * 60 },
          );
          enviados++;
        } catch (erro) {
          const status = (erro as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await apagarInscricaoPush(i.endpoint);
          else console.error("[push] falha ao enviar", status ?? erro);
        }
      }),
    );
    return enviados;
  } catch (erro) {
    console.error("[push] falha ao preparar o envio", erro);
    return 0;
  }
}
