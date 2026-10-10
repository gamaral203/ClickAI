"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArrowRight, KeyRound, Loader2, Rocket, Trash2, Unlock } from "lucide-react";

import {
  arquivarEventoAcao,
  excluirEventoAcao,
  liberarAgoraAcao,
  publicarEventoAcao,
} from "@/app/(fotografo)/painel/eventos/acoes";
import { Button, buttonVariants } from "@/components/ui/button";

type Props = {
  eventoId: string;
  status: "rascunho" | "publicado" | "revisao" | "arquivado";
  /** Fotos prontas ainda não liberadas (agendadas ou aguardando). */
  pendentesDeLiberacao: number;
};

export function AcoesEvento({ eventoId, status, pendentesDeLiberacao }: Props) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [irParaPerfil, setIrParaPerfil] = useState(false);
  const [pendente, startTransition] = useTransition();

  function executar(
    acao: (id: string) => Promise<{ erro?: string; irParaPerfil?: boolean }>,
    aoConcluir?: () => void,
  ) {
    setErro(null);
    setIrParaPerfil(false);
    startTransition(async () => {
      const resultado = await acao(eventoId).catch(() => ({
        erro: "Não foi possível concluir.",
        irParaPerfil: false,
      }));
      if (resultado.erro) {
        setErro(resultado.erro);
        setIrParaPerfil(Boolean(resultado.irParaPerfil));
      } else if (aoConcluir) return aoConcluir();
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
        {pendentesDeLiberacao > 0 && (
          <Button
            size="touch"
            variant={status === "publicado" ? "default" : "outline"}
            disabled={pendente}
            onClick={() => executar(liberarAgoraAcao)}
          >
            <Unlock aria-hidden="true" />
            Liberar{" "}
            {pendentesDeLiberacao === 1
              ? "a foto pendente"
              : `as ${pendentesDeLiberacao} fotos pendentes`}{" "}
            agora
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
        <Button
          variant="ghost"
          size="touch"
          disabled={pendente}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            if (
              window.confirm(
                "Excluir este evento de vez? As fotos e os arquivos enviados são apagados e não dá para desfazer. (Evento com pedido não pode ser excluído: use Arquivar.)",
              )
            )
              executar(excluirEventoAcao, () => router.replace("/painel/eventos"));
          }}
        >
          <Trash2 aria-hidden="true" />
          Excluir evento
        </Button>
      </div>
      {erro &&
        (irParaPerfil ? (
          // Pendência de recebimento: não é falha, é um passo que falta. Quadro com o caminho.
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-highlight-foreground/20 bg-highlight/25 p-4 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background">
              <KeyRound aria-hidden="true" className="size-5 text-primary" />
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <p className="font-semibold">Falta um passo para publicar</p>
              <p className="text-sm text-muted-foreground">{erro}</p>
            </div>
            <Link
              href="/painel/perfil"
              className={buttonVariants({ size: "touch", className: "w-full sm:w-fit" })}
            >
              Abrir Perfil e recebimento
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </div>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ))}
    </div>
  );
}
