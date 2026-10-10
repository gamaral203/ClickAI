"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Trophy, UserPlus, UserRound } from "lucide-react";

import type { PosicaoTopCliques } from "@/dados";
import { formatarPorcentagem, formatarPreco } from "@/lib/formatar";

type Criterio = "fotos" | "valor";

/**
 * Top Cliques: a equipe do evento em ordem de fotos vendidas ou de valor vendido. Barras com o
 * tamanho relativo ao primeiro colocado; os números aparecem em texto ao lado de cada nome.
 */
export function TopCliques({
  posicoes,
  destaque,
  convidar,
}: {
  posicoes: PosicaoTopCliques[];
  /** Fotógrafo que está vendo, destacado na lista. */
  destaque?: string;
  /** Link para convidar colaboradores (só na página do dono); sem ele, a seção some quando a equipe é só uma pessoa. */
  convidar?: string;
}) {
  const [criterio, setCriterio] = useState<Criterio>("fotos");
  if (posicoes.length === 0) return null;
  if (posicoes.length < 2 && !convidar) return null;
  const medida = (p: PosicaoTopCliques) => (criterio === "fotos" ? p.vendidas : p.faturadoCentavos);
  const ordenadas = [...posicoes].sort(
    (a, b) => medida(b) - medida(a) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const maior = Math.max(1, ...ordenadas.map(medida));

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Trophy aria-hidden="true" className="size-5 text-primary" />
            Top Cliques
          </h2>
          <p className="text-sm text-muted-foreground">
            Ranking da equipe deste evento. Só contam vendas pagas (estornos ficam de fora). Cada um
            vê só o próprio nome.
          </p>
        </div>
        <div role="group" aria-label="Ordenar por" className="flex rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["fotos", "Mais fotos"],
              ["valor", "Mais vendido (R$)"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={criterio === valor}
              onClick={() => setCriterio(valor)}
              className="h-10 rounded-md px-3 font-medium text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {posicoes.length < 2 && convidar && (
        <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          <UserPlus aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Por enquanto só você está na equipe. Chame outros fotógrafos em{" "}
            <Link href={convidar} className="font-semibold underline underline-offset-2">
              Colaboradores
            </Link>{" "}
            e o ranking compara as vendas de cada um.
          </span>
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {ordenadas.map((p, i) => (
          <li key={p.fotografoId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-3">
                <span className="w-6 text-sm font-bold text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {/* Só o próprio nome e a própria foto aparecem; os outros ficam anônimos, pela posição. */}
                {p.fotografoId === destaque && p.foto ? (
                  <span className="relative size-8 shrink-0 self-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                    <Image src={p.foto} alt="" fill sizes="32px" className="object-cover" />
                  </span>
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center self-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                    <UserRound aria-hidden="true" className="size-4" />
                  </span>
                )}
                <span className={p.fotografoId === destaque ? "font-semibold" : "font-medium"}>
                  {p.fotografoId === destaque ? p.nome : `Fotógrafo ${i + 1}`}
                  {p.fotografoId === destaque && (
                    <span className="font-normal text-muted-foreground"> (você)</span>
                  )}
                </span>
              </span>
              <span className="text-right text-sm text-muted-foreground tabular-nums">
                {p.vendidas} de {p.enviadas} {p.enviadas === 1 ? "foto" : "fotos"}
                {p.enviadas > 0 && (
                  <span className="ml-1 rounded-full bg-highlight/40 px-1.5 py-0.5 text-xs font-medium text-highlight-foreground">
                    {formatarPorcentagem(p.vendidas / p.enviadas)}
                  </span>
                )}{" "}
                · {formatarPreco(p.faturadoCentavos)}
              </span>
            </div>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full rounded-full ${i === 0 ? "bg-highlight" : "bg-primary"}`}
                style={{ width: `${(medida(p) / maior) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
