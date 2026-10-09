"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";

import { responderConviteAcao } from "@/app/(fotografo)/painel/colaboracoes/acoes";
import { Button } from "@/components/ui/button";

/** Botões do convite pendente: aceitar libera o envio de fotos; recusar apaga o convite. */
export function ResponderConvite({ colaboradorId }: { colaboradorId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function responder(aceitar: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await responderConviteAcao(colaboradorId, aceitar).catch(() => ({
        erro: "Não foi possível responder agora. Tente de novo.",
      }));
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="touch" disabled={pendente} onClick={() => responder(true)}>
          {pendente ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <Check aria-hidden="true" data-icon="inline-start" />
          )}
          Aceitar o convite
        </Button>
        <Button variant="outline" size="touch" disabled={pendente} onClick={() => responder(false)}>
          <X aria-hidden="true" data-icon="inline-start" />
          Recusar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
