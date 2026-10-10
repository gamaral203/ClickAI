import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarPlus, ChartColumn, Images } from "lucide-react";

import { StatusEventoSelo } from "@/components/painel/status-evento";
import { buttonVariants } from "@/components/ui/button";
import { listarEventosDoFotografo } from "@/dados";
import { formatarData } from "@/lib/formatar";
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
    <ul className="flex flex-col divide-y rounded-xl border">
      {eventos.map((evento) => (
        // No celular, uma coluna (título, dados, contagem e botão um embaixo do outro).
        <li
          key={evento.id}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/painel/eventos/${evento.id}`} className="font-semibold hover:underline">
                {evento.titulo}
              </Link>
              <StatusEventoSelo status={evento.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatarData(evento.inicioEm)} · {evento.cidade}, {evento.estado} ·{" "}
              {evento.categoria.nome}
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Images aria-hidden="true" className="size-4" />
            {evento.totalItens} {evento.totalItens === 1 ? "foto" : "fotos"} · {evento.vendidos}{" "}
            {evento.vendidos === 1 ? "vendida" : "vendidas"}
          </p>
          {/* No celular, os dois botões dividem a linha. */}
          <div className="flex gap-2">
            <Link
              href={`/painel/eventos/${evento.id}/desempenho`}
              aria-label={`Desempenho de ${evento.titulo}`}
              className={buttonVariants({
                variant: "outline",
                size: "touch",
                className: "flex-1 sm:flex-none",
              })}
            >
              <ChartColumn aria-hidden="true" data-icon="inline-start" />
              Desempenho
            </Link>
            <Link
              href={`/painel/eventos/${evento.id}`}
              className={buttonVariants({
                variant: "outline",
                size: "touch",
                className: "flex-1 sm:flex-none",
              })}
            >
              Gerenciar
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
