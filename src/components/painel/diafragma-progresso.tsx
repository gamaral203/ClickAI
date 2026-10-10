"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";

// Progresso do envio de fotos como o diafragma de uma câmera: anel grosso e 6 lâminas curvas
// que deixam uma abertura no meio, onde fica a porcentagem. Durante o envio as lâminas abrem e
// fecham sem parar (um ciclo de ~1,8 s) e, além disso, a abertura vai crescendo com a
// porcentagem: em 0% o ciclo vai de quase fechado a meio aberto; perto de 100%, de meio aberto
// a quase todo aberto. No fim, o ciclo para com o diafragma todo aberto e só então entra o
// check. Com "reduzir movimento" no sistema, não há ciclo: a abertura só acompanha a
// porcentagem.
//
// A forma das lâminas muda com a abertura (cada lâmina é o espaço entre dois lados do hexágono
// central, prolongados até a borda e curvados), então o desenho é refeito a cada quadro com
// requestAnimationFrame, direto nos <path>, sem passar pelo React.

const CENTRO = 60;
/** Raio até onde as lâminas vão (por baixo do anel). */
const RAIO_LAMINAS = 53;
/** Anel: raio médio e espessura (vai de 48 a 58). */
const RAIO_ANEL = 53;
const ESPESSURA_ANEL = 10;

/** Abertura (raio do hexágono central) no ponto mais fechado do ciclo, em 0% e em 100%. */
const ABERTURA_MIN_0 = 27;
const ABERTURA_MIN_100 = 37;
/** Quanto o ciclo abre além do ponto mais fechado. */
const PULSO = 7;
/** Diafragma todo aberto (fim do envio). */
const ABERTURA_TOTAL = 47;
/** Duração de um ciclo de abrir e fechar. */
const CICLO_MS = 1800;
/** Quanto as lâminas giram a cada unidade de abertura (como num diafragma de verdade). */
const GIRO_POR_ABERTURA = 1.6;
/** Curvatura das lâminas (fração do comprimento da borda). */
const CURVA = 0.28;
/** Tempo para a abertura alcançar o alvo (a porcentagem mudou ou o envio terminou). */
const SUAVIZACAO_MS = 220;

const numero = (n: number) => n.toLocaleString("pt-BR");
const r1 = (n: number) => Math.round(n * 100) / 100;

const REDUZIR = "(prefers-reduced-motion: reduce)";
function assinarMovimento(avisar: () => void) {
  const consulta = window.matchMedia(REDUZIR);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}
const semMovimento = () => window.matchMedia(REDUZIR).matches;

type Ponto = [number, number];

/**
 * Caminho das 6 lâminas para uma abertura (raio do hexágono central). Cada lado do hexágono é
 * prolongado até a borda; a lâmina j fica entre o prolongamento do lado j e o do lado j + 1,
 * com as bordas curvadas (a mesma curva nas duas lâminas que a dividem, sem buraco).
 */
export function laminasDoDiafragma(abertura: number): string[] {
  const giro = ((-30 + (abertura - ABERTURA_MIN_0) * GIRO_POR_ABERTURA) * Math.PI) / 180;
  const vertices: Ponto[] = Array.from({ length: 6 }, (_, j) => {
    const a = giro + (j * Math.PI) / 3;
    return [CENTRO + abertura * Math.cos(a), CENTRO + abertura * Math.sin(a)];
  });
  // Borda j: do vértice j + 1, na direção do lado j, até a borda das lâminas.
  const bordas = vertices.map((_, j) => {
    const [ax, ay] = vertices[j];
    const [bx, by] = vertices[(j + 1) % 6];
    const comprimento = Math.hypot(bx - ax, by - ay);
    const [ux, uy] = [(bx - ax) / comprimento, (by - ay) / comprimento];
    const [px, py] = [bx - CENTRO, by - CENTRO];
    const produto = px * ux + py * uy;
    const t = -produto + Math.sqrt(produto * produto - (px * px + py * py - RAIO_LAMINAS ** 2));
    const fim: Ponto = [bx + t * ux, by + t * uy];
    // Ponto de controle: meio da borda, deslocado para o lado (dá a forma de foice).
    const controle: Ponto = [
      bx + (t / 2) * ux - CURVA * t * uy,
      by + (t / 2) * uy + CURVA * t * ux,
    ];
    return { inicio: [bx, by] as Ponto, fim, controle };
  });
  return bordas.map((borda, j) => {
    const proxima = bordas[(j + 1) % 6];
    const p = (q: Ponto) => `${r1(q[0])} ${r1(q[1])}`;
    return (
      `M${p(borda.inicio)}Q${p(borda.controle)} ${p(borda.fim)}` +
      `A${RAIO_LAMINAS} ${RAIO_LAMINAS} 0 0 1 ${p(proxima.fim)}` +
      `Q${p(proxima.controle)} ${p(proxima.inicio)}Z`
    );
  });
}

/** Ponto mais fechado do ciclo para a porcentagem. */
const aberturaMinima = (valor: number) =>
  ABERTURA_MIN_0 + ((ABERTURA_MIN_100 - ABERTURA_MIN_0) * valor) / 100;

export function DiafragmaProgresso({
  porcentagem,
  concluidas,
  total,
  ativo = true,
  concluido = false,
  rotulo = "Progresso do envio das fotos",
}: {
  /** 0 a 100. */
  porcentagem: number;
  concluidas: number;
  total: number;
  /** O envio está em andamento: as lâminas abrem e fecham. */
  ativo?: boolean;
  /** Terminou sem problemas: mostra o check quando o diafragma termina de abrir. */
  concluido?: boolean;
  rotulo?: string;
}) {
  const valor = Math.min(100, Math.max(0, Math.floor(porcentagem)));
  const reduzir = useSyncExternalStore(assinarMovimento, semMovimento, () => false);
  const laminas = useRef<(SVGPathElement | null)[]>([]);
  /** Abertura desenhada agora e quanto de pulso ainda há (some aos poucos no fim). */
  const estado = useRef({ base: aberturaMinima(valor), pulso: 0, inicio: 0 });
  /** O diafragma terminou de abrir de vez (100%, envio parado). */
  const [abriu, setAbriu] = useState(false);

  const todoAberto = valor === 100 && !ativo;
  const alvo = todoAberto ? ABERTURA_TOTAL : aberturaMinima(valor);
  const pulsando = ativo && !reduzir;

  useEffect(() => {
    let quadro = 0;
    let anterior = performance.now();
    if (!estado.current.inicio) estado.current.inicio = anterior;
    const desenhar = (agora: number) => {
      const s = estado.current;
      const passo = Math.min(1, (agora - anterior) / SUAVIZACAO_MS);
      anterior = agora;
      s.base += (alvo - s.base) * passo;
      s.pulso += ((pulsando ? 1 : 0) - s.pulso) * passo;
      // Ciclo suave (seno): 0 no ponto mais fechado, 1 no mais aberto.
      const fase = (1 - Math.cos((2 * Math.PI * (agora - s.inicio)) / CICLO_MS)) / 2;
      const abertura = Math.min(ABERTURA_TOTAL, s.base + PULSO * fase * s.pulso);
      laminasDoDiafragma(abertura).forEach((d, i) => laminas.current[i]?.setAttribute("d", d));
      const parado = Math.abs(alvo - s.base) < 0.05 && s.pulso < 0.01;
      if (parado && !pulsando) {
        if (todoAberto) setAbriu(true);
        return;
      }
      if (!todoAberto) setAbriu(false);
      quadro = requestAnimationFrame(desenhar);
    };
    quadro = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, pulsando, todoAberto]);

  const mostrarCheck = concluido && todoAberto && abriu;
  const fotos = `${numero(concluidas)} de ${numero(total)} ${total === 1 ? "foto" : "fotos"}`;
  // Primeiro desenho (servidor e hidratação): a abertura da porcentagem, sem pulso.
  const iniciais = laminasDoDiafragma(alvo);
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      aria-valuetext={`${valor}%, ${fotos}`}
      className="flex shrink-0 flex-col items-center gap-2"
    >
      <div className="relative size-28 sm:size-40">
        <svg viewBox="0 0 120 120" aria-hidden="true" className="size-full">
          <circle cx={CENTRO} cy={CENTRO} r={RAIO_ANEL} className="fill-background" />
          <g className="fill-primary stroke-background" strokeWidth="1.6" strokeLinejoin="round">
            {iniciais.map((d, i) => (
              <path
                key={i}
                d={d}
                ref={(el) => {
                  laminas.current[i] = el;
                }}
              />
            ))}
          </g>
          {/* Fresta clara entre as lâminas e o anel, como no ícone. */}
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RAIO_ANEL - ESPESSURA_ANEL / 2 - 0.4}
            fill="none"
            strokeWidth="1.6"
            className="stroke-background"
          />
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RAIO_ANEL}
            fill="none"
            strokeWidth={ESPESSURA_ANEL}
            className="stroke-primary"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {mostrarCheck ? (
            <Check aria-hidden="true" strokeWidth={3} className="size-8 text-primary sm:size-11" />
          ) : (
            <span className="text-base leading-none font-bold tabular-nums sm:text-2xl">
              {valor}%
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums sm:text-sm">{fotos}</span>
    </div>
  );
}
