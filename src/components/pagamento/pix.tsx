"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";

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

export function QrCodePix({
  copiaECola,
  qrCodeBase64,
}: {
  copiaECola: string;
  qrCodeBase64: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(copiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3_000);
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-muted p-4 sm:flex-row sm:items-start">
      <Image
        src={`data:image/png;base64,${qrCodeBase64}`}
        alt="QR Code do Pix"
        width={192}
        height={192}
        unoptimized
        className="size-48 shrink-0 rounded-md bg-white p-2"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm">
          Abra o app do seu banco, escolha pagar com Pix e leia o QR Code, ou copie o código abaixo.
        </p>
        <code className="max-h-24 overflow-y-auto rounded-md bg-background p-2 text-xs break-all">
          {copiaECola}
        </code>
        <Button variant="outline" size="touch" onClick={copiar} className="w-fit">
          {copiado ? (
            <Check aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Copy aria-hidden="true" data-icon="inline-start" />
          )}
          {copiado ? "Código copiado" : "Copiar código Pix"}
        </Button>
      </div>
    </div>
  );
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
