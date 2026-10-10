import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Calendar, CalendarPlus, Camera, ChartColumn, Images, MapPin } from "lucide-react";

import { StatusEventoSelo } from "@/components/painel/status-evento";
import { buttonVariants } from "@/components/ui/button";
import { listarEventosDoFotografo } from "@/dados";
import { formatarPeriodo } from "@/lib/formatar";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Meus eventos",
  robots: { index: false, follow: false },
};

export default function PaginaEventosDoPainel() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Meus eventos</h1>
        <Link href="/painel/eventos/novo" className={buttonVariants({ size: "touch" })}>
          <CalendarPlus aria-hidden="true" data-icon="inline-start" />
          Novo evento
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Lista />
      </Suspense>
    </div>
  );
}

async function Lista() {
  const { conta } = await exigirFotografo("/painel/eventos");
  const eventos = await listarEventosDoFotografo(conta.id);

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-semibold">Você ainda não criou eventos</p>
        <p className="text-sm text-muted-foreground">
          Crie o evento, envie as fotos e publique quando estiver tudo pronto.
        </p>
      </div>
    );
  }

  return (
    // Cartões com a capa, como numa vitrine: 1 por linha no celular, 2 no tablet, 3 no computador.
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {eventos.map((evento) => (
        <li
          key={evento.id}
          className="flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
        >
          <Link
            href={`/painel/eventos/${evento.id}`}
            aria-label={`Gerenciar ${evento.titulo}`}
            className="relative block aspect-[3/2] bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {evento.capaMiniatura ? (
              <Image
                src={evento.capaMiniatura.urlMiniatura}
                alt=""
                fill
                sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Camera aria-hidden="true" className="size-8" />
                <span className="text-sm font-medium">
                  {evento.processando > 0 ? "Processando as fotos…" : "Sem fotos ainda"}
                </span>
              </span>
            )}
            <span className="absolute top-3 left-3">
              <StatusEventoSelo status={evento.status} />
            </span>
          </Link>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <Link
                href={`/painel/eventos/${evento.id}`}
                className="text-lg leading-tight font-semibold hover:underline"
              >
                {evento.titulo}
              </Link>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">
                  {evento.local ? `${evento.local} · ` : ""}
                  {evento.cidade}, {evento.estado}
                </span>
              </p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar aria-hidden="true" className="size-4 shrink-0" />
                {formatarPeriodo(evento.inicioEm, evento.fimEm)}
              </p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Images aria-hidden="true" className="size-4 shrink-0" />
                {evento.totalItens} {evento.totalItens === 1 ? "foto" : "fotos"} · {evento.vendidos}{" "}
                {evento.vendidos === 1 ? "vendida" : "vendidas"} · {evento.categoria.nome}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link
                href={`/painel/eventos/${evento.id}/desempenho`}
                aria-label={`Desempenho de ${evento.titulo}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "touch",
                  className: "flex-1",
                })}
              >
                <ChartColumn aria-hidden="true" data-icon="inline-start" />
                Desempenho
              </Link>
              <Link
                href={`/painel/eventos/${evento.id}`}
                className={buttonVariants({ size: "touch", className: "min-w-[8.5rem] flex-1" })}
              >
                Gerenciar
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
