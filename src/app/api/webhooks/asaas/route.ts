import type { NextRequest } from "next/server";
import { z } from "zod";

import { buscarSaquePorGatewayId } from "@/dados";
import { tokenDoWebhookConfere } from "@/lib/asaas";
import { provedorDePagamento } from "@/lib/gateway";
import { processarNotificacaoDeCobranca } from "@/servicos/pagamentos";
import { conferirSaques } from "@/servicos/saques";

// Webhook do Asaas. Configurar no painel do Asaas em Integrações > Webhooks com a URL
// https://<domínio>/api/webhooks/asaas, o token de autenticação igual a ASAAS_WEBHOOK_TOKEN e
// os eventos de cobranças (PAYMENT_*) e de transferências (TRANSFER_*).
//
// Regras (docs/riscos.md, prioridade alta): o token é conferido antes de qualquer coisa; o corpo
// só diz qual cobrança ou transferência mudou, e o status vem da API do Asaas; confirmar duas
// vezes não faz nada, então avisos repetidos ou fora de ordem são seguros.

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const corpo = z.object({
  event: z.string(),
  payment: z.object({ id }).optional(),
  transfer: z.object({ id }).optional(),
});

function resposta(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (provedorDePagamento() !== "asaas") return resposta(404);
  if (!tokenDoWebhookConfere(request.headers.get("asaas-access-token"))) return resposta(401);

  const dados = corpo.safeParse(await request.json().catch(() => null));
  // Evento de outro tipo ou corpo inesperado: confirma o recebimento e ignora, para o Asaas não
  // reenviar para sempre (e não pausar a fila depois de 15 falhas).
  if (!dados.success) return resposta(200);

  try {
    if (dados.data.event.startsWith("PAYMENT_") && dados.data.payment) {
      await processarNotificacaoDeCobranca(dados.data.payment.id);
    } else if (dados.data.event.startsWith("TRANSFER_") && dados.data.transfer) {
      const saque = await buscarSaquePorGatewayId(dados.data.transfer.id);
      if (saque?.status === "processando") await conferirSaques(saque.fotografoId);
    }
  } catch (erro) {
    // Falha ao consultar a API: responde erro para o Asaas tentar de novo mais tarde.
    console.error("Falha ao processar notificação do Asaas", erro);
    return resposta(500);
  }
  return resposta(200);
}
