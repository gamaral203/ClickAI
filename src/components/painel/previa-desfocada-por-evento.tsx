"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Fingerprint } from "lucide-react";

import { definirPreviaDesfocadaAcao } from "@/app/(fotografo)/painel/marca-dagua/acoes";
import { Interruptor } from "@/components/ui/interruptor";
import type { EventoDaPreviaDesfocada } from "@/dados/painel";
import { formatarData } from "@/lib/formatar";

/**
 * "Prévia desfocada com círculo de revelação" em Painel > Marca d'água, em destaque: o que é e um
 * liga/desliga para cada evento do fotógrafo (desligada por padrão). Ligada, o cliente vê a foto
 * desfocada e revela partes com o dedo ou o mouse; desligada, vê a prévia nítida com a marca.
 */
export function PreviaDesfocadaPorEvento({ eventos }: { eventos: EventoDaPreviaDesfocada[] }) {
  const [ligadas, mudarLigada] = useOptimistic(
    Object.fromEntries(eventos.map((e) => [e.id, e.previaDesfocada])),
    (atual: Record<string, boolean>, [id, ligada]: [string, boolean]) => ({
      ...atual,
      [id]: ligada,
    }),
  );
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string, ligada: boolean) {
    setErro(null);
    iniciar(async () => {
      mudarLigada([id, ligada]);
      const r = await definirPreviaDesfocadaAcao(id, ligada).catch(() => ({
        erro: "Não foi possível salvar.",
      }));
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border-2 border-primary/40 bg-accent/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Fingerprint aria-hidden="true" className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Prévia desfocada com círculo de revelação</h2>
          <p className="text-sm text-muted-foreground">
            Ligada num evento, o cliente vê cada foto desfocada e, ao tocar e segurar (ou passar o
            mouse), um círculo revela aquela parte nítida, ainda com a marca d&apos;água. Mais
            proteção contra print; desligada, ele vê a prévia nítida com a marca.
          </p>
        </div>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você ainda não tem eventos. Crie um em Meus eventos e volte aqui para ligar.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {eventos.map((e) => (
            <li key={e.id}>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 sm:px-4">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{e.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatarData(e.inicioEm)} · {ligadas[e.id] ? "Desfocada" : "Nítida com marca"}
                  </span>
                </span>
                <Interruptor
                  checked={Boolean(ligadas[e.id])}
                  onChange={(ev) => alternar(e.id, ev.target.checked)}
                  aria-label={`Prévia desfocada em ${e.titulo}`}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
