"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { gerarPix } from "@/app/(cliente)/pedidos/[id]/acoes";
import { Button } from "@/components/ui/button";

/**
 * Recarrega os dados da página a cada poucos segundos enquanto o pedido espera pagamento. O
 * servidor confere a order no Mercado Pago a cada recarga (com intervalo mínimo), então a
 * página vira "pago" sozinha, mesmo se o webhook atrasar.
 */
export function AtualizadorDePagamento({ intervaloMs = 5_000 }: { intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervaloMs);
    return () => clearInterval(id);
  }, [router, intervaloMs]);
  return null;
}

export function BotaoGerarPix({ pedidoId, token }: { pedidoId: string; token: string | null }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const [falhou, setFalhou] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Não conseguimos gerar o Pix agora. Tente de novo em alguns segundos.
      </p>
      <Button
        size="touch"
        className="w-fit"
        disabled={enviando}
        onClick={() =>
          startTransition(async () => {
            setFalhou(false);
            const ok = await gerarPix(pedidoId, token).catch(() => false);
            if (!ok) setFalhou(true);
            router.refresh();
          })
        }
      >
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        ) : (
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
        )}
        Gerar Pix
      </Button>
      {falhou && (
        <p role="alert" className="text-sm text-destructive">
          Ainda não deu certo. Se continuar, faça o pedido de novo.
        </p>
      )}
    </div>
  );
}
