"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// Relógio que avança a cada segundo. No servidor não há relógio (`null`): a contagem só
// aparece no navegador, sem diferença entre o HTML do servidor e o primeiro render.
function assinarRelogio(avisar: () => void) {
  const id = setInterval(avisar, 1000);
  return () => clearInterval(id);
}
const segundoAtual = () => Math.floor(Date.now() / 1000);
const semRelogio = () => null;

/** Singular, plural, segundos da unidade e quantas cabem na unidade acima. */
const UNIDADES = [
  ["dia", "dias", 86400, Infinity],
  ["hora", "horas", 3600, 24],
  ["minuto", "minutos", 60, 60],
  ["segundo", "segundos", 1, 60],
] as const;

/**
 * Contagem regressiva até a liberação agendada das fotos. Ao chegar a zero, pede a página de
 * novo ao servidor, que confere a hora e mostra a galeria.
 */
export function ContagemRegressiva({ alvo }: { alvo: string }) {
  const router = useRouter();
  const agora = useSyncExternalStore(assinarRelogio, segundoAtual, semRelogio);
  const restante = agora === null ? null : Math.max(0, Math.floor(Date.parse(alvo) / 1000) - agora);
  const chegou = restante === 0;

  useEffect(() => {
    if (chegou) router.refresh();
  }, [chegou, router]);

  if (restante === null) return null;
  if (chegou) return <p className="font-medium">Liberando as fotos…</p>;

  const partes = UNIDADES.map(([singular, plural, segundos, limite]) => {
    const valor = Math.floor(restante / segundos) % limite;
    return { chave: plural, valor, rotulo: valor === 1 ? singular : plural };
  });

  return (
    // O texto muda a cada segundo: leitores de tela ouvem só o rótulo, não cada mudança.
    <div aria-label="Tempo até a liberação das fotos" role="timer" className="flex gap-2 sm:gap-3">
      {partes.map(({ chave, valor, rotulo }) => (
        <div
          key={chave}
          className="flex min-w-16 flex-col items-center rounded-lg bg-background px-3 py-2 tabular-nums"
        >
          <span className="text-2xl font-bold">{String(valor).padStart(2, "0")}</span>
          <span className="text-xs text-muted-foreground">{rotulo}</span>
        </div>
      ))}
    </div>
  );
}
