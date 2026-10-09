import Image from "next/image";
import Link from "next/link";
import { Camera, Flame } from "lucide-react";

import type { EventoResumo } from "@/dados";

/**
 * "Mais vendidos da semana": os eventos que mais venderam fotos nos últimos 7 dias. Fundo
 * claro, título grande para chamar atenção e cartões pequenos numa faixa que rola de lado (no
 * celular, com o dedo). O número no canto é a posição.
 */
export function TopDaSemana({ eventos }: { eventos: EventoResumo[] }) {
  if (eventos.length === 0) return null;
  return (
    <section aria-labelledby="top-semana" className="bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-12">
        <div className="flex flex-col gap-2">
          <p className="flex w-fit items-center gap-1.5 rounded-full bg-highlight px-3 py-1 text-xs font-bold tracking-wide text-highlight-foreground uppercase">
            <Flame aria-hidden="true" className="size-3.5" />
            Em alta agora
          </p>
          <h2
            id="top-semana"
            className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl"
          >
            Mais vendidos da semana
          </h2>
          <p className="text-muted-foreground">
            Os eventos com mais fotos vendidas nos últimos 7 dias.
          </p>
        </div>
        <ol className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:thin] gap-4 overflow-x-auto px-4 pb-2">
          {eventos.map((evento, i) => (
            <li key={evento.id} className="w-40 shrink-0 snap-start sm:w-44">
              <Link
                href={`/eventos/${evento.slug}`}
                className="group flex flex-col gap-2 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="relative block aspect-square overflow-hidden rounded-xl bg-muted">
                  {evento.capaMiniatura ? (
                    <Image
                      src={evento.capaMiniatura.urlMiniatura}
                      alt=""
                      fill
                      sizes="176px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <Camera aria-hidden="true" className="size-8" />
                    </span>
                  )}
                  <span
                    className={`absolute top-2 left-2 flex size-9 items-center justify-center rounded-full text-sm font-extrabold tabular-nums shadow ${
                      i === 0
                        ? "bg-highlight text-highlight-foreground"
                        : "bg-background text-foreground"
                    }`}
                  >
                    {i + 1}º
                  </span>
                </span>
                <span className="flex flex-col">
                  <span className="line-clamp-2 text-sm font-semibold group-hover:underline">
                    {evento.titulo}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {evento.cidade}, {evento.estado}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
