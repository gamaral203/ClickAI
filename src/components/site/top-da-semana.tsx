import Image from "next/image";
import Link from "next/link";
import { Camera, Flame } from "lucide-react";

import type { EventoResumo } from "@/dados";

/**
 * "Em alta agora": os eventos que mais venderam fotos nos últimos 7 dias, numa faixa que rola de
 * lado (no celular, com o dedo). O número grande é a posição.
 */
export function TopDaSemana({ eventos }: { eventos: EventoResumo[] }) {
  if (eventos.length === 0) return null;
  return (
    <section aria-labelledby="top-semana" className="bg-[#111216] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-bold tracking-wide text-highlight uppercase">
            <Flame aria-hidden="true" className="size-4" />
            Em alta agora
          </p>
          <h2 id="top-semana" className="text-2xl font-bold tracking-tight">
            {eventos.length >= 10 ? "Top 10 eventos da semana" : "Mais vendidos da semana"}
          </h2>
          <p className="text-sm text-white/70">
            Os eventos com mais fotos vendidas nos últimos 7 dias.
          </p>
        </div>
        <ol className="-mx-4 flex snap-x snap-mandatory [scrollbar-width:thin] gap-4 overflow-x-auto px-4 pb-2">
          {eventos.map((evento, i) => (
            <li key={evento.id} className="w-56 shrink-0 snap-start sm:w-60">
              <Link
                href={`/eventos/${evento.slug}`}
                className="group flex flex-col gap-3 rounded-xl focus-visible:ring-3 focus-visible:ring-highlight/60 focus-visible:outline-none"
              >
                <span className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-white/10">
                  {evento.capaMiniatura ? (
                    <Image
                      src={evento.capaMiniatura.urlMiniatura}
                      alt=""
                      fill
                      sizes="240px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-white/50">
                      <Camera aria-hidden="true" className="size-10" />
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/20"
                  />
                  <span className="absolute top-3 left-4 flex flex-col gap-1">
                    <span className="text-6xl leading-none font-extrabold tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`h-1 w-16 rounded-full ${i === 0 ? "bg-highlight" : "bg-white/70"}`}
                    />
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="line-clamp-2 font-semibold">{evento.titulo}</span>
                  <span
                    className={`text-xs font-bold uppercase ${i === 0 ? "text-highlight" : "text-white/60"}`}
                  >
                    {i + 1}º lugar · {evento.cidade}, {evento.estado}
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
