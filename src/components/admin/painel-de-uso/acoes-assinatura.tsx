"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pause, Pencil, Play, Trash2 } from "lucide-react";

import {
  alternarAssinaturaAcao,
  excluirAssinaturaAcao,
  type ResultadoAcaoUso,
} from "@/app/(admin)/admin/uso/acoes";
import { Button, buttonVariants } from "@/components/ui/button";

const FALHA: ResultadoAcaoUso = { erro: "Não foi possível concluir. Tente de novo." };

/**
 * Ações de uma assinatura: editar (abre o formulário pela URL), desativar/reativar e excluir.
 * Excluir pede confirmação na própria linha, sem janela do navegador.
 */
export function AcoesAssinatura({
  id,
  nome,
  ativa,
  editar,
}: {
  id: string;
  nome: string;
  ativa: boolean;
  /** Endereço que abre o formulário de edição. */
  editar: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function rodar(acao: () => Promise<ResultadoAcaoUso>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao().catch(() => FALHA);
      if (r.erro) setErro(r.erro);
      else setConfirmando(false);
      router.refresh();
    });
  }

  if (confirmando) {
    return (
      <div
        role="group"
        aria-label={`Confirmar exclusão de ${nome}`}
        className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2"
      >
        <p className="text-xs font-medium">Excluir {nome} de vez?</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={pendente}
            onClick={() => rodar(() => excluirAssinaturaAcao(id))}
          >
            {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
            Excluir
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </Button>
        </div>
        {erro && (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={editar}
          scroll={false}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          aria-label={`Editar ${nome}`}
        >
          <Pencil aria-hidden="true" />
          Editar
        </Link>
        <Button
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => rodar(() => alternarAssinaturaAcao(id, !ativa))}
          aria-label={`${ativa ? "Desativar" : "Reativar"} ${nome}`}
        >
          {pendente ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : ativa ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {ativa ? "Desativar" : "Reativar"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            setErro(null);
            setConfirmando(true);
          }}
          aria-label={`Excluir ${nome}`}
        >
          <Trash2 aria-hidden="true" />
          Excluir
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
