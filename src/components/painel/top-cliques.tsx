import { Trophy } from "lucide-react";

import type { PosicaoTopCliques } from "@/dados";

/**
 * Top Cliques: a equipe do evento em ordem de fotos vendidas. Barras com o tamanho relativo ao
 * primeiro colocado; a quantidade aparece em texto, ao lado de cada nome.
 */
export function TopCliques({
  posicoes,
  destaque,
}: {
  posicoes: PosicaoTopCliques[];
  /** Fotógrafo que está vendo, destacado na lista. */
  destaque?: string;
}) {
  if (posicoes.length < 2) return null;
  const maior = Math.max(1, ...posicoes.map((p) => p.vendidas));
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Trophy aria-hidden="true" className="size-5 text-primary" />
          Top Cliques
        </h2>
        <p className="text-sm text-muted-foreground">
          Quem mais vendeu fotos neste evento. Só contam vendas pagas (estornos ficam de fora).
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {posicoes.map((p, i) => (
          <li key={p.fotografoId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-3">
                <span className="w-6 text-sm font-bold text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={p.fotografoId === destaque ? "font-semibold" : "font-medium"}>
                  {p.nome}
                  {p.fotografoId === destaque && (
                    <span className="font-normal text-muted-foreground"> (você)</span>
                  )}
                </span>
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {p.vendidas} {p.vendidas === 1 ? "foto" : "fotos"}
              </span>
            </div>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full rounded-full ${i === 0 ? "bg-highlight" : "bg-primary"}`}
                style={{ width: `${(p.vendidas / maior) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
