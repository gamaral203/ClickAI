"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import type { FiltroGaleria } from "@/dados";
import { enderecoDaGaleria, paginasVisiveis } from "@/lib/galeria";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  filtro: FiltroGaleria;
  pagina: number;
  totalPaginas: number;
  /** Rótulo da navegação para leitores de tela (há uma no topo e outra embaixo da grade). */
  rotulo?: string;
};

const base =
  "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const comum = "border hover:border-highlight hover:bg-accent hover:text-accent-foreground";
const atual = "border border-primary bg-primary text-primary-foreground";
const desligado = "border text-muted-foreground opacity-50";

/** Mostra que a página pedida está carregando, dentro do link tocado. */
function Carregando({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      <span className="sr-only">Carregando</span>
    </>
  ) : (
    children
  );
}

/**
 * Páginas da galeria como links reais: funcionam sem JavaScript, o Next pré-carrega a página e
 * o `#galeria` do endereço leva ao topo da galeria (não da página). No computador:
 * "Anterior 1 … 4 5 6 7 8 … 80 Próxima"; no celular: "‹ 6 de 80 ›", em que o meio é uma lista
 * para pular direto para qualquer página.
 */
export function Paginacao({ slug, filtro, pagina, totalPaginas, rotulo = "Páginas" }: Props) {
  const router = useRouter();
  if (totalPaginas <= 1) return null;
  const href = (p: number) => enderecoDaGaleria(slug, filtro, { pagina: p });
  const temAnterior = pagina > 1;
  const temProxima = pagina < totalPaginas;

  const anterior = (compacto: boolean) =>
    temAnterior ? (
      <Link href={href(pagina - 1)} rel="prev" className={cn(base, comum)}>
        <Carregando>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Carregando>
        {compacto ? <span className="sr-only">Página anterior</span> : <span>Anterior</span>}
      </Link>
    ) : (
      <span aria-disabled="true" className={cn(base, desligado)}>
        <ChevronLeft aria-hidden="true" className="size-4" />
        {compacto ? <span className="sr-only">Página anterior</span> : <span>Anterior</span>}
      </span>
    );

  const proxima = (compacto: boolean) =>
    temProxima ? (
      <Link href={href(pagina + 1)} rel="next" className={cn(base, comum)}>
        {compacto ? <span className="sr-only">Próxima página</span> : <span>Próxima</span>}
        <Carregando>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Carregando>
      </Link>
    ) : (
      <span aria-disabled="true" className={cn(base, desligado)}>
        {compacto ? <span className="sr-only">Próxima página</span> : <span>Próxima</span>}
        <ChevronRight aria-hidden="true" className="size-4" />
      </span>
    );

  return (
    <nav aria-label={rotulo} className="w-full">
      {/* Celular: compacto, com a lista de páginas no meio. */}
      <div className="flex items-center justify-center gap-2 sm:hidden">
        {anterior(true)}
        <label className="relative">
          <span className="sr-only">Ir para a página</span>
          <select
            value={pagina}
            onChange={(e) => router.push(href(Number(e.target.value)))}
            className={cn(
              base,
              "appearance-none border border-primary bg-background pr-8 text-primary tabular-nums",
            )}
          >
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                {p} de {totalPaginas}
              </option>
            ))}
          </select>
          <ChevronRight
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 rotate-90 text-primary"
          />
        </label>
        {proxima(true)}
      </div>

      {/* Computador e tablet: números com reticências. */}
      <ul className="hidden flex-wrap items-center justify-center gap-1.5 sm:flex">
        <li>{anterior(false)}</li>
        {paginasVisiveis(pagina, totalPaginas).map((p, i) =>
          p === "…" ? (
            <li key={`r${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={href(p)}
                aria-current={p === pagina ? "page" : undefined}
                className={cn(base, "tabular-nums", p === pagina ? atual : comum)}
              >
                <span className="sr-only">Página </span>
                {p === pagina ? p : <Carregando>{p}</Carregando>}
              </Link>
            </li>
          ),
        )}
        <li>{proxima(false)}</li>
      </ul>
    </nav>
  );
}
