"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Loader2, Rocket, Unlock } from "lucide-react";

import {
  arquivarEventoAcao,
  liberarAgoraAcao,
  publicarEventoAcao,
} from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";

type Props = {
  eventoId: string;
  status: "rascunho" | "publicado" | "revisao" | "arquivado";
  liberacaoManualPendente: boolean;
};

export function AcoesEvento({ eventoId, status, liberacaoManualPendente }: Props) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar(acao: (id: string) => Promise<{ erro?: string }>, aoConcluir?: () => void) {
    setErro(null);
    startTransition(async () => {
      const resultado = await acao(eventoId).catch(() => ({ erro: "Não foi possível concluir." }));
      if (resultado.erro) setErro(resultado.erro);
      else if (aoConcluir) return aoConcluir();
      router.refresh();
    });
  }

  // Depois de publicar, a página mostra o aviso e o cartão para divulgar o link e o QR Code.
  const aoPublicar = () => router.replace(`/painel/eventos/${eventoId}?publicado=1`);

  if (status === "revisao") {
    return (
      <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
        Este evento está em revisão pela equipe do ClicouAí depois de uma denúncia e não aparece
        para o público. Você receberá um e-mail com o resultado.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(status === "rascunho" || status === "arquivado") && (
          <Button
            size="touch"
            disabled={pendente}
            onClick={() => executar(publicarEventoAcao, aoPublicar)}
          >
            {pendente ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Rocket aria-hidden="true" />
            )}
            Publicar
          </Button>
        )}
        {status === "publicado" && liberacaoManualPendente && (
          <Button size="touch" disabled={pendente} onClick={() => executar(liberarAgoraAcao)}>
            <Unlock aria-hidden="true" />
            Liberar as fotos agora
          </Button>
        )}
        {status === "publicado" && (
          <Button
            variant="outline"
            size="touch"
            disabled={pendente}
            onClick={() => executar(arquivarEventoAcao)}
          >
            <Archive aria-hidden="true" />
            Arquivar
          </Button>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
