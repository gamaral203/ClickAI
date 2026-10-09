"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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

  function reembolsar() {
    setResultado(null);
    startTransition(async () => {
      const r = await reembolsarAcao(pedidoId, confirmacao).catch(() => FALHA);
      setResultado(r);
      if (r.ok) setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <span className="flex flex-col items-start gap-1">
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          Reembolsar
        </Button>
        <Retorno resultado={resultado} />
      </span>
    );
  }

  return (
    <div className="flex max-w-xs flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
      <p>
        Devolver <strong>{total}</strong> ao comprador? Os downloads param na hora e o valor sai do
        saldo dos fotógrafos (abatido do próximo saque, se já foi sacado). Não dá para desfazer.
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
        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={pendente || confirmacao.trim() === ""}
          onClick={reembolsar}
        >
          {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
          Confirmar reembolso
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => {
            setAberto(false);
            setConfirmacao("");
            setResultado(null);
          }}
        >
          Cancelar
        </Button>
      </div>
      <Retorno resultado={resultado} />
    </div>
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
