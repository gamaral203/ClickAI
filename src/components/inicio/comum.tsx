import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Largura das seções da página inicial (a mesma do cabeçalho e do rodapé). */
export const CONTAINER = "mx-auto w-full max-w-7xl px-4 md:px-6";

/**
 * Trilho dos carrosséis no celular: rola de lado com o dedo (scroll-snap nativo, sem biblioteca) e
 * encosta nas bordas da tela. Do tablet em diante, vira uma grade (a classe da grade vem junto).
 * A rolagem fica só dentro do trilho: a página nunca rola de lado.
 */
export const TRILHO =
  "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden";

/** O mesmo trilho, que continua carrossel no tablet e só vira grade no computador. */
export const TRILHO_ATE_LG =
  "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] md:-mx-6 md:scroll-px-6 md:gap-4 md:px-6 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden";

/** Título de seção com o subtítulo e o "Ver todos" à direita. */
export function CabecalhoSecao({
  id,
  titulo,
  subtitulo,
  link,
}: {
  id: string;
  titulo: string;
  subtitulo?: string;
  /** `curto` aparece no celular; `longo`, do tablet em diante. */
  link?: { href: string; curto: string; longo?: string };
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${subtitulo ? "items-end" : "items-center md:items-end"}`}
    >
      <div className="min-w-0">
        <h2
          id={id}
          className="text-xl leading-tight font-extrabold tracking-tight text-balance min-[400px]:text-[1.375rem] md:text-3xl"
        >
          {titulo}
        </h2>
        {subtitulo && (
          <p className="mt-1 text-sm text-muted-foreground md:text-base">{subtitulo}</p>
        )}
      </div>
      {link && (
        <Link
          href={link.href}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:text-base"
        >
          <span className={link.longo ? "md:hidden" : undefined}>{link.curto}</span>
          {link.longo && <span className="hidden md:inline">{link.longo}</span>}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Botão redondo com a seta, decorativo: o link é o cartão inteiro. */
export function SetaRedonda({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none ${className}`}
    >
      <ArrowRight className="size-4" />
    </span>
  );
}
