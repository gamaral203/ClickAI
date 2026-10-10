"use client";

import { Check } from "lucide-react";

// Círculo de progresso do envio de fotos: um trilho cinza e um arco azul que se preenche, com a
// porcentagem no meio e quantas fotos já terminaram embaixo dela. O arco desliza entre os
// valores; com "reduzir movimento" no sistema, só o valor muda.

const RAIO = 52;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

const numero = (n: number) => n.toLocaleString("pt-BR");

export function CirculoProgresso({
  porcentagem,
  concluidas,
  total,
  concluido = false,
  rotulo = "Progresso do envio das fotos",
}: {
  /** 0 a 100. */
  porcentagem: number;
  concluidas: number;
  total: number;
  /** Terminou sem problemas: mostra o check no lugar da porcentagem. */
  concluido?: boolean;
  rotulo?: string;
}) {
  const valor = Math.min(100, Math.max(0, Math.floor(porcentagem)));
  const fotos = `${numero(concluidas)} de ${numero(total)} ${total === 1 ? "foto" : "fotos"}`;
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      aria-valuetext={`${valor}%, ${fotos}`}
      className="relative size-28 shrink-0 sm:size-40"
    >
      <svg viewBox="0 0 120 120" aria-hidden="true" className="size-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={RAIO}
          fill="none"
          strokeWidth="9"
          className="stroke-muted-foreground/15"
        />
        <circle
          cx="60"
          cy="60"
          r={RAIO}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - valor / 100)}
          // Em 0%, a ponta arredondada desenharia um ponto solto.
          strokeOpacity={valor === 0 ? 0 : 1}
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
        {concluido ? (
          <Check aria-hidden="true" strokeWidth={3} className="size-8 text-primary sm:size-11" />
        ) : (
          <span className="text-2xl leading-none font-bold tabular-nums sm:text-4xl">{valor}%</span>
        )}
        <span className="max-w-[70%] text-[11px] leading-tight text-balance text-muted-foreground tabular-nums sm:text-xs">
          {fotos}
        </span>
      </div>
    </div>
  );
}
