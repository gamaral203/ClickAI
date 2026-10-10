"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";

// Círculo de progresso do envio de fotos: um trilho cinza e um arco azul que se preenche, com a
// porcentagem no meio e quantas fotos já terminaram embaixo dela. O arco desliza entre os
// valores; com "reduzir movimento" no sistema, só o valor muda. O check do fim só entra quando
// o arco termina de fechar (antes disso, o centro mostra "100%").

const RAIO = 52;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/** Duração do deslize do arco (a mesma da classe `duration-500`). */
const DESLIZE_MS = 500;

const numero = (n: number) => n.toLocaleString("pt-BR");

const REDUZIR = "(prefers-reduced-motion: reduce)";
function assinarMovimento(avisar: () => void) {
  const consulta = window.matchMedia(REDUZIR);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}
const semMovimento = () => window.matchMedia(REDUZIR).matches;

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
  const reduzir = useSyncExternalStore(assinarMovimento, semMovimento, () => false);
  /** O arco terminou de deslizar e parou em 100%. */
  const [fechou, setFechou] = useState(false);
  // Garantia para quando o navegador não avisa o fim do deslize (arco que já estava cheio).
  useEffect(() => {
    if (valor !== 100) return;
    const espera = setTimeout(() => setFechou(true), DESLIZE_MS + 150);
    return () => clearTimeout(espera);
  }, [valor]);
  const mostrarCheck = concluido && valor === 100 && (fechou || reduzir);
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
          onTransitionEnd={(e) => {
            if (e.propertyName === "stroke-dashoffset") setFechou(valor === 100);
          }}
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
        {mostrarCheck ? (
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
