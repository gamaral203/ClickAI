"use client";

import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Fingerprint, Palette, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

const ABAS = [
  { id: "modelos", rotulo: "Modelos de marca", curto: "Modelos", Icone: Palette },
  { id: "ajustar", rotulo: "Ajustar a marca", curto: "Ajustar", Icone: SlidersHorizontal },
  { id: "previa", rotulo: "Prévia desfocada", curto: "Prévia desfocada", Icone: Fingerprint },
] as const;
type Aba = (typeof ABAS)[number]["id"];

function ehAba(valor: string | null): valor is Aba {
  return ABAS.some((a) => a.id === valor);
}

/**
 * Painel > Marca d'água em três abas (um botão para cada parte): os modelos, os ajustes da marca e
 * a prévia desfocada por evento. As abas fora da tela ficam montadas e só escondidas, para não
 * perder o que o fotógrafo estava mexendo; a aba aberta vai na URL (?aba=…), sem recarregar.
 */
export function AbasDaMarca({
  modelos,
  ajustar,
  previa,
}: {
  modelos: React.ReactNode;
  ajustar: React.ReactNode;
  previa: React.ReactNode;
}) {
  const busca = useSearchParams();
  const inicial = busca.get("aba");
  const [aba, setAba] = useState<Aba>(ehAba(inicial) ? inicial : "modelos");
  const base = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const paineis: Record<Aba, React.ReactNode> = { modelos, ajustar, previa };

  function abrir(nova: Aba) {
    setAba(nova);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", nova);
    window.history.replaceState(window.history.state, "", url);
  }

  // Setas trocam de aba (padrão das abas acessíveis).
  function teclado(e: React.KeyboardEvent, indice: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const proxima = (indice + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length;
    abrir(ABAS[proxima].id);
    botoes.current[proxima]?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Partes da marca d'água"
        className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1"
      >
        {ABAS.map(({ id, rotulo, curto, Icone }, i) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-${id}`}
              aria-selected={ativa}
              aria-controls={`${base}-${id}-painel`}
              tabIndex={ativa ? 0 : -1}
              onClick={() => abrir(id)}
              onKeyDown={(e) => teclado(e, i)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none sm:flex-row sm:gap-2 sm:text-sm",
                ativa
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icone aria-hidden="true" className="size-4 shrink-0" />
              <span className="sm:hidden">{curto}</span>
              <span className="hidden sm:inline">{rotulo}</span>
            </button>
          );
        })}
      </div>

      {ABAS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`${base}-${id}-painel`}
          aria-labelledby={`${base}-${id}`}
          hidden={aba !== id}
          className="flex flex-col gap-3"
        >
          {paineis[id]}
        </div>
      ))}
    </div>
  );
}
