import type { NextRequest } from "next/server";
import { z } from "zod";

import { provedorDePagamento } from "@/lib/gateway";
import { assinaturaDoWebhookConfere } from "@/lib/mercadopago";
import { processarNotificacaoDeOrder } from "@/servicos/pagamentos";

// Webhook do Mercado Pago. Configurar no painel do Mercado Pago em Suas integrações > Webhooks
// com a URL https://<domínio>/api/webhooks/mercadopago e os eventos "Order (Mercado Pago)" e
// "Chargebacks". Pagamento, reembolso (`order.refunded`) e chargeback (`order.charged_back`)
// chegam todos com `type: "order"` e o id da order; o que fazer vem da order lida na API
// (src/servicos/pagamentos.ts e src/servicos/estornos.ts).
//
// Regras (docs/riscos.md, prioridade alta): assinatura conferida antes de qualquer coisa; o
// corpo só diz qual order mudou, e o status vem da API do Mercado Pago; confirmar duas vezes
// não faz nada, então avisos repetidos ou fora de ordem são seguros.

const corpo = z.object({
  type: z.string(),
  data: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }),
});

function resposta(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  // Com o Asaas em uso, este webhook não vale (o do Asaas é /api/webhooks/asaas).
  if (provedorDePagamento() !== "mercadopago") return resposta(404);

  // O id assinado é o da query string (?data.id=…), não o do corpo.
  const dataId = request.nextUrl.searchParams.get("data.id");
  const valida = assinaturaDoWebhookConfere({
    dataId,
    requestId: request.headers.get("x-request-id"),
    assinatura: request.headers.get("x-signature"),
  });
  if (!valida) return resposta(401);

  const dados = corpo.safeParse(await request.json().catch(() => null));
  // Outros tipos de evento, ou corpo que não bate com o id assinado: confirma o recebimento e
  // ignora, para o Mercado Pago não reenviar para sempre.
  if (!dados.success || dados.data.type !== "order" || dados.data.data.id !== dataId) {
    return resposta(200);
  }

  try {
    await processarNotificacaoDeOrder(dados.data.data.id);
  } catch (erro) {
    // Falha ao consultar a API: responde erro para o Mercado Pago tentar de novo mais tarde.
    console.error("Falha ao processar notificação do Mercado Pago", erro);
    return resposta(500);
  }
  return resposta(200);
}
