"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Undo2 } from "lucide-react";

import {
  marcarAssinaturaPagaAcao,
  renovarNoProximoMesAcao,
  type ResultadoAcaoUso,
} from "@/app/(admin)/admin/uso/acoes";
import { Button } from "@/components/ui/button";

const FALHA: ResultadoAcaoUso = { erro: "Não foi possível concluir. Tente de novo." };

function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  function rodar(acao: () => Promise<ResultadoAcaoUso>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao().catch(() => FALHA);
      if (r.erro) setErro(r.erro);
      else depois?.();
      router.refresh();
    });
  }
  return { erro, pendente, rodar };
}

/**
 * Paga ou não, numa conta do mês. Marcar lança a cobrança paga no Financeiro; desmarcar a apaga,
 * por isso pede confirmação na própria linha, como o excluir da tabela de assinaturas.
 */
export function BotaoPaga({
  id,
  nome,
  paga,
  pagaEm,
}: {
  id: string;
  nome: string;
  paga: boolean;
  /** "09/11/2026" quando paga. */
  pagaEm: string | null;
}) {
  const { erro, pendente, rodar } = useAcao();
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div
        role="group"
        aria-label={`Confirmar desmarcar ${nome}`}
        className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2"
      >
        <p className="text-xs font-medium">
          Desmarcar {nome}? A cobrança lançada no Financeiro é apagada.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={pendente}
            onClick={() =>
              rodar(
                () => marcarAssinaturaPagaAcao(id, false),
                () => setConfirmando(false),
              )
            }
          >
            {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
            Desmarcar
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
    <div className="flex flex-col items-start gap-1">
      {paga ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-accent-foreground">
            <Check aria-hidden="true" className="size-3" />
            Paga{pagaEm ? ` em ${pagaEm}` : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmando(true)}
            aria-label={`Desmarcar ${nome} como paga`}
          >
            <Undo2 aria-hidden="true" />
            Desmarcar
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => rodar(() => marcarAssinaturaPagaAcao(id, true))}
          aria-label={`Marcar ${nome} como paga`}
        >
          {pendente ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Check aria-hidden="true" />
          )}
          Marcar como paga
        </Button>
      )}
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Caixinha "Renova no próximo mês?"; só muda no mês atual (o servidor confere). */
export function CaixaRenova({
  id,
  nome,
  renova,
  editavel,
}: {
  id: string;
  nome: string;
  renova: boolean;
  editavel: boolean;
}) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={renova}
          disabled={!editavel || pendente}
          onChange={(e) => {
            const marcado = e.currentTarget.checked;
            rodar(() => renovarNoProximoMesAcao(id, marcado));
          }}
          aria-label={`${nome}: renova no próximo mês?`}
        />
        <span aria-hidden="true">{renova ? "Sim" : "Não"}</span>
        {pendente && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
      </label>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
