"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  reembolsarAcao,
  restaurarAcao,
  type ResultadoAcaoEstorno,
} from "@/app/(admin)/admin/vendas/acoes";
import { Button } from "@/components/ui/button";

const FALHA: ResultadoAcaoEstorno = { ok: false, erro: "Não foi possível concluir." };

function Retorno({ resultado }: { resultado: ResultadoAcaoEstorno | null }) {
  if (!resultado) return null;
  return resultado.ok ? (
    <span role="status" className="text-xs text-muted-foreground">
      {resultado.mensagem}
    </span>
  ) : (
    <span role="alert" className="text-xs text-destructive">
      {resultado.erro}
    </span>
  );
}

/**
 * Reembolso total de um pedido pago, em dois passos: o gestor abre a confirmação e digita o
 * valor do pedido. O servidor confere o valor e devolve sempre o total que está no banco.
 */
export function BotaoReembolsar({ pedidoId, total }: { pedidoId: string; total: string }) {
  const router = useRouter();
  const campo = useId();
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [resultado, setResultado] = useState<ResultadoAcaoEstorno | null>(null);
  const [pendente, startTransition] = useTransition();

  const dialogo = useRef<HTMLDialogElement>(null);

  // A confirmação é um <dialog> modal: dentro da célula da tabela ela ficava cortada pela rolagem.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  function fechar() {
    setAberto(false);
    setConfirmacao("");
  }

  function reembolsar() {
    setResultado(null);
    startTransition(async () => {
      const r = await reembolsarAcao(pedidoId, confirmacao).catch(() => FALHA);
      setResultado(r);
      if (r.ok) fechar();
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setResultado(null);
          setAberto(true);
        }}
      >
        Reembolsar
      </Button>
      {!aberto && <Retorno resultado={resultado} />}

      <dialog
        ref={dialogo}
        onClose={fechar}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pendente) fechar();
        }}
        aria-labelledby={`${campo}-titulo`}
        className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-2xl bg-transparent p-0 text-left text-foreground backdrop:bg-black/50"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmacao.trim()) reembolsar();
          }}
          className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-background p-5 text-sm shadow-2xl"
        >
          <p id={`${campo}-titulo`} className="text-base font-semibold">
            Reembolsar {total}?
          </p>
          <p className="text-muted-foreground">
            O valor volta ao comprador, os downloads param na hora e o valor sai do saldo dos
            fotógrafos (abatido do próximo saque, se já foi sacado). Não dá para desfazer.
          </p>
          <label htmlFor={campo} className="text-xs text-muted-foreground">
            Para confirmar, digite o valor do pedido
          </label>
          <input
            id={campo}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder={total}
            autoComplete="off"
            inputMode="decimal"
            className="h-11 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Retorno resultado={resultado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={pendente}
              onClick={fechar}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="touch"
              disabled={pendente || confirmacao.trim() === ""}
            >
              {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
              Confirmar reembolso
            </Button>
          </div>
        </form>
      </dialog>
    </span>
  );
}

/** Contestação ganha: restaura o pedido depois de conferir a order no Mercado Pago. */
export function BotaoRestaurar({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoAcaoEstorno | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => {
          if (
            !window.confirm(
              "Restaurar o pedido? Só funciona se o gateway mostrar a cobrança como paga.",
            )
          ) {
            return;
          }
          setResultado(null);
          startTransition(async () => {
            setResultado(await restaurarAcao(pedidoId).catch(() => FALHA));
            router.refresh();
          });
        }}
      >
        {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
        Contestação ganha: restaurar
      </Button>
      <Retorno resultado={resultado} />
    </span>
  );
}
