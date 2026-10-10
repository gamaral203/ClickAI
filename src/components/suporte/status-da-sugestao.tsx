"use client";

import { useState, useTransition } from "react";

import { mudarStatusSugestaoAcao } from "@/app/(admin)/admin/suporte/acoes";
import type { StatusSugestao } from "@/dados/suporte";

const OPCOES: { valor: StatusSugestao; rotulo: string }[] = [
  { valor: "nova", rotulo: "Nova" },
  { valor: "em_analise", rotulo: "Em análise" },
  { valor: "feita", rotulo: "Feita" },
  { valor: "descartada", rotulo: "Descartada" },
];

/** Seletor do status de uma sugestão (gestão). Grava ao mudar. */
export function StatusDaSugestao({ id, status }: { id: string; status: StatusSugestao }) {
  const [atual, setAtual] = useState(status);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  return (
    <div className="flex shrink-0 flex-col gap-1 sm:w-40">
      <label htmlFor={`status-${id}`} className="sr-only">
        Status da sugestão
      </label>
      <select
        id={`status-${id}`}
        value={atual}
        disabled={salvando}
        onChange={(e) => {
          const novo = e.target.value as StatusSugestao;
          const antes = atual;
          setAtual(novo);
          setErro(null);
          startSalvar(async () => {
            const r = await mudarStatusSugestaoAcao({ id, status: novo }).catch(() => ({
              erro: "Não salvou.",
            }));
            if (r.erro) {
              setAtual(antes);
              setErro(r.erro);
            }
          });
        }}
        className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      >
        {OPCOES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
