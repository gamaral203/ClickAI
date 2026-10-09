"use client";

import { useState, useTransition } from "react";

import { definirDescontoProgressivoAcao } from "@/app/(fotografo)/painel/descontos/acoes";

/** Liga ou desliga o desconto progressivo só neste evento, sem apagar as faixas. */
export function AlternarDescontoProgressivo({
  eventoId,
  ligado,
}: {
  eventoId: string;
  ligado: boolean;
}) {
  const [valor, setValor] = useState(ligado);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  function mudar(novo: boolean) {
    setValor(novo);
    setErro(null);
    startTransition(async () => {
      const r = await definirDescontoProgressivoAcao(eventoId, novo).catch(() => ({
        erro: "Não foi possível salvar. Tente de novo.",
      }));
      if (r.erro) {
        setValor(!novo);
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={valor}
          disabled={salvando}
          onChange={(e) => mudar(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>
          <span className="font-medium">Desconto progressivo ligado neste evento</span>
          <span className="block text-muted-foreground">
            Desligado, as faixas abaixo (ou a sua regra padrão) não valem aqui. Elas ficam guardadas
            para quando você ligar de novo.
          </span>
        </span>
      </label>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
