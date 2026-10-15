"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

// Obturador de íris com 6 lâminas, desenhado num quadro de 100 x 100. Cada lâmina é um
// semiplano recortado pelo círculo da lente e gira em torno de um pivô no aro: com o giro em 0°
// as seis bordas passam pelo centro (fechado); quanto maior o giro, maior o hexágono do meio.

const CENTRO = 50;
const RAIO = 44;
const LAMINAS = 6;
/** Giro de cada lâmina, em graus. */
const FECHADO = 3;
const REPOUSO = 30;
const ABERTO = 52;

function girar(x: number, y: number, angulo: number): [number, number] {
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  const dx = x - CENTRO;
  const dy = y - CENTRO;
  return [CENTRO + dx * cos - dy * sen, CENTRO + dx * sen + dy * cos];
}

/** Caminho da lâmina `indice` com o giro `graus` em torno do seu pivô no aro. */
function caminhoDaLamina(indice: number, graus: number): string {
  const a = (graus * Math.PI) / 180;
  const posicao = (indice * 2 * Math.PI) / LAMINAS;
  const px = CENTRO;
  const py = CENTRO - RAIO;
  // Direção da borda da lâmina (do pivô para dentro) e o lado que a lâmina cobre.
  const dx = -Math.sin(a);
  const dy = Math.cos(a);
  const nx = -Math.cos(a);
  const ny = -Math.sin(a);
  const pontos: [number, number][] = [
    [px - 60 * dx, py - 60 * dy],
    [px + 120 * dx, py + 120 * dy],
    [px + 120 * dx + 120 * nx, py + 120 * dy + 120 * ny],
    [px - 60 * dx + 120 * nx, py - 60 * dy + 120 * ny],
  ];
  return (
    "M" +
    pontos
      .map(([x, y]) => girar(x, y, posicao))
      .map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`)
      .join("L") +
    "Z"
  );
}

const CAMINHOS_EM_REPOUSO = Array.from({ length: LAMINAS }, (_, i) => caminhoDaLamina(i, REPOUSO));

/** Id seguro para usar em `url(#...)`. */
function useIdDoRecorte() {
  return `obturador-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function Lente({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <clipPath id={id}>
          <circle cx={CENTRO} cy={CENTRO} r={RAIO} />
        </clipPath>
      </defs>
      {/* O vão do meio aparece em verde-limão. */}
      <circle cx={CENTRO} cy={CENTRO} r={RAIO} className="fill-highlight" />
      <g clipPath={`url(#${id})`}>{children}</g>
      <circle
        cx={CENTRO}
        cy={CENTRO}
        r={RAIO + 2}
        fill="none"
        strokeWidth={4}
        className="stroke-white"
      />
    </svg>
  );
}

/** Ícone parado (cantos das fotos): lâminas meio abertas, sem animação. */
export function IconeObturador({ className }: { className?: string }) {
  const id = useIdDoRecorte();
  return (
    <Lente id={id} className={className}>
      {CAMINHOS_EM_REPOUSO.map((d, i) => (
        <path
          key={i}
          d={d}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className="fill-profundo stroke-primary"
        />
      ))}
    </Lente>
  );
}

function Lamina({ indice, giro }: { indice: number; giro: MotionValue<number> }) {
  const d = useTransform(giro, (graus) => caminhoDaLamina(indice, graus));
  return (
    <motion.path
      d={d}
      strokeWidth={1.8}
      strokeLinejoin="round"
      className="fill-profundo stroke-primary"
    />
  );
}

/**
 * Obturador animado do botão central. Ao mudar `aberto`, as lâminas fecham e reabrem como num
 * disparo e param bem abertas (painel aberto) ou meio abertas (repouso). Com
 * `prefers-reduced-motion`, muda direto, sem animação.
 */
export function Obturador({ aberto, className }: { aberto: boolean; className?: string }) {
  const id = useIdDoRecorte();
  const reduzir = useReducedMotion();
  const alvo = aberto ? ABERTO : REPOUSO;
  const giro = useMotionValue(alvo);
  const anterior = useRef(alvo);

  useEffect(() => {
    if (anterior.current === alvo) return;
    anterior.current = alvo;
    if (reduzir) {
      giro.set(alvo);
      return;
    }
    const controle = animate(giro, [giro.get(), FECHADO, alvo], {
      duration: 0.6,
      times: [0, 0.35, 1],
      ease: ["easeIn", "easeOut"],
    });
    return () => controle.stop();
  }, [alvo, reduzir, giro]);

  return (
    <Lente id={id} className={cn("shrink-0", className)}>
      {Array.from({ length: LAMINAS }, (_, i) => (
        <Lamina key={i} indice={i} giro={giro} />
      ))}
    </Lente>
  );
}
