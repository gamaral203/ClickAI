"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlarmClock, Check, Copy, Loader2, Undo2 } from "lucide-react";

import { marcarSaqueNaoRealizadoAcao, marcarSaquePagoAcao } from "@/app/(admin)/admin/saques/acoes";
import { Button } from "@/components/ui/button";

export type SaqueAPagar = {
  id: string;
  fotografoNome: string;
  /** CPF/CNPJ formatado: a chave Pix para onde mandar. */
  chavePix: string;
  valor: string;
  antecipado: boolean;
  pedidoEm: string;
  pagarAte: string;
  atrasado: boolean;
};

/**
 * Saques pedidos que a gestão precisa pagar à mão: copia a chave, faz o Pix no app do banco e
 * marca como pago (o fotógrafo é avisado). "Não realizado" devolve o saldo ao fotógrafo.
 */
export function SaquesAPagar({ saques }: { saques: SaqueAPagar[] }) {
  if (saques.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed p-5 text-muted-foreground">
        <Check aria-hidden="true" className="size-5 text-primary" />
        Nenhum saque esperando pagamento.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {saques.map((s) => (
        <LinhaSaque key={s.id} saque={s} />
      ))}
    </ul>
  );
}

function LinhaSaque({ saque }: { saque: SaqueAPagar }) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar(acao: () => Promise<{ erro?: string }>, pergunta: string) {
    if (!window.confirm(pergunta)) return;
    setErro(null);
    startTransition(async () => {
      const r = await acao().catch(() => ({ erro: "Não foi possível concluir." }));
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(saque.chavePix.replace(/\D/g, ""));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {saque.fotografoNome}
          {saque.antecipado && (
            <span className="rounded-full bg-highlight/40 px-2 py-0.5 text-xs font-medium">
              Antecipado
            </span>
          )}
        </p>
        <p className="text-2xl font-bold tabular-nums">{saque.valor}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Chave Pix (CPF/CNPJ): <span className="font-mono">{saque.chavePix}</span>
          <button
            type="button"
            onClick={copiar}
            className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-accent"
          >
            {copiado ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Copy aria-hidden="true" className="size-3.5" />
            )}
            {copiado ? "Copiada" : "Copiar"}
          </button>
        </p>
        <p
          className={`flex items-center gap-1.5 text-sm ${saque.atrasado ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
          <AlarmClock aria-hidden="true" className="size-4" />
          Pedido em {saque.pedidoEm} · pagar até {saque.pagarAte}
          {saque.atrasado && " (atrasado)"}
        </p>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="touch"
          disabled={pendente}
          onClick={() =>
            executar(
              () => marcarSaquePagoAcao(saque.id),
              `Confirma que o Pix de ${saque.valor} para ${saque.fotografoNome} já foi feito?`,
            )
          }
        >
          {pendente ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <Check aria-hidden="true" data-icon="inline-start" />
          )}
          Marcar como pago
        </Button>
        <Button
          variant="outline"
          size="touch"
          disabled={pendente}
          onClick={() =>
            executar(
              () => marcarSaqueNaoRealizadoAcao(saque.id),
              "Não vai fazer este Pix? O saldo volta para o fotógrafo pedir de novo.",
            )
          }
        >
          <Undo2 aria-hidden="true" data-icon="inline-start" />
          Não realizado
        </Button>
      </div>
    </li>
  );
}
