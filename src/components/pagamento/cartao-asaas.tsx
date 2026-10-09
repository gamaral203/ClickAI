"use client";

import { useState } from "react";
import { CreditCard, Loader2, Lock } from "lucide-react";

import { pagarCartaoNoAsaasAcao } from "@/app/(cliente)/pedidos/[id]/acoes";
import { Button } from "@/components/ui/button";

/**
 * Cartão pelo Asaas: o comprador paga na página segura da cobrança no Asaas, então o número do
 * cartão nunca passa pelo ClicouAí. Ao voltar, esta página confere a cobrança e libera as fotos.
 */
export function CartaoAsaas({ pedidoId, token }: { pedidoId: string; token: string | null }) {
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAbrindo(true);
    setErro(null);
    const url = await pagarCartaoNoAsaasAcao(pedidoId, token).catch(() => null);
    if (url) {
      window.location.assign(url);
      return;
    }
    setAbrindo(false);
    setErro("Não foi possível abrir o pagamento agora. Atualize a página e tente de novo.");
  }

  return (
    <div className="flex flex-col gap-3">
      <Button size="touch" onClick={abrir} disabled={abrindo} className="w-full sm:w-fit">
        {abrindo ? (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        ) : (
          <CreditCard aria-hidden="true" data-icon="inline-start" />
        )}
        Pagar com cartão
      </Button>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock aria-hidden="true" className="size-4" />
        Você paga na página segura do Asaas. Depois, volte aqui: as fotos são liberadas assim que o
        pagamento for confirmado.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
