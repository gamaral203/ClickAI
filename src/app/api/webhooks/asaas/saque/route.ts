import type { NextRequest } from "next/server";

import { reivindicarSaqueParaTransferencia } from "@/dados";
import { tokenDoWebhookConfere } from "@/lib/asaas";
import { provedorDePagamento } from "@/lib/gateway";

import { decidirValidacao } from "./decisao";

// Validação de saque do Asaas (Integrações > Mecanismos de segurança > "Validação de saque via
// webhook"), com a URL https://<domínio>/api/webhooks/asaas/saque e o token igual a
// ASAAS_WEBHOOK_TOKEN. Uns 5 segundos depois de qualquer saída de dinheiro da conta, o Asaas
// pergunta aqui se pode seguir; sem resposta válida (3 tentativas), ele cancela a operação.
//
// É a proteção contra pagar duas vezes e contra quem roubar a chave da API: só sai a
// transferência que bate com um saque registrado aqui (src/servicos/saques.ts). As regras estão
// em ./decisao.ts.

function responder(corpo: { status: "APPROVED" } | { status: "REFUSED"; refuseReason: string }) {
  return Response.json(corpo, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (provedorDePagamento() !== "asaas") return new Response(null, { status: 404 });
  if (!tokenDoWebhookConfere(request.headers.get("asaas-access-token"))) {
    return new Response(null, { status: 401 });
  }
  const decisao = await decidirValidacao(
    await request.json().catch(() => null),
    reivindicarSaqueParaTransferencia,
    process.env.ASAAS_APROVAR_OUTRAS_SAIDAS === "1",
  );
  if (decisao.aprovado) return responder({ status: "APPROVED" });
  console.warn("Saída recusada na validação do Asaas", { motivo: decisao.motivo });
  return responder({ status: "REFUSED", refuseReason: decisao.motivo });
}
