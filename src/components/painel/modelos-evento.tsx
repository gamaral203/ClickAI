"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CopyPlus, Loader2, X } from "lucide-react";

import { duplicarEventoAcao, excluirModeloAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";

/** Duplica um evento recente direto da tela de novo evento. */
export function DuplicarRecente({ eventoId }: { eventoId: string }) {
  const [pendente, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pendente}
      onClick={() => start(async () => void (await duplicarEventoAcao(eventoId)))}
    >
      {pendente ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <CopyPlus aria-hidden="true" />
      )}
      Duplicar
    </Button>
  );
}

export function ExcluirModelo({ modeloId, nome }: { modeloId: string; nome: string }) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      aria-label={`Excluir o modelo ${nome}`}
      onClick={() =>
        start(async () => {
          await excluirModeloAcao(modeloId);
          router.replace("/painel/eventos/novo");
        })
      }
      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {pendente ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <X aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}
