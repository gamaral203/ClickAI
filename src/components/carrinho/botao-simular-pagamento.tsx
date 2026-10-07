"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlaskConical, Loader2 } from "lucide-react";

import { simularPagamento } from "@/app/(cliente)/pedidos/[id]/acoes";
import { Button } from "@/components/ui/button";

export function BotaoSimularPagamento({
  pedidoId,
  token,
}: {
  pedidoId: string;
  token: string | null;
}) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const [falhou, setFalhou] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="touch"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            setFalhou(false);
            const ok = await simularPagamento(pedidoId, token).catch(() => false);
            if (!ok) setFalhou(true);
            router.refresh();
          })
        }
      >
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        ) : (
          <FlaskConical aria-hidden="true" data-icon="inline-start" />
        )}
        Simular pagamento aprovado
      </Button>
      {falhou && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível simular o pagamento. O pedido pode ter expirado.
        </p>
      )}
    </div>
  );
}
