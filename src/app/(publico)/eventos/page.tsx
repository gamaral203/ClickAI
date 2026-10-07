import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarEventosPublicados } from "@/dados";
import { lerFiltroEventos } from "@/lib/validacao";

export const metadata: Metadata = {
  title: "Eventos",
  description: "Encontre o evento em que você estava e veja as fotos.",
};

export default function PaginaEventos({ searchParams }: PageProps<"/eventos">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Eventos</h1>
      {/* searchParams só existe na requisição: o resto da página sai pronto do build. */}
      <Suspense fallback={<EsqueletoEventos />}>
        <EventosFiltrados searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EventosFiltrados({
  searchParams,
}: {
  searchParams: PageProps<"/eventos">["searchParams"];
}) {
  const filtro = lerFiltroEventos(await searchParams);
  const eventos = await listarEventosPublicados(filtro);
  const filtrando = Boolean(filtro.busca || filtro.data);

  return (
    <>
      <form
        action="/eventos"
        role="search"
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="busca">Nome do evento, cidade ou fotógrafo</Label>
          <Input
            id="busca"
            name="busca"
            type="search"
            maxLength={100}
            defaultValue={filtro.busca}
            placeholder="Ex.: corrida, formatura, Curitiba"
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={filtro.data} className="h-11" />
        </div>
        <button type="submit" className={buttonVariants({ size: "touch" })}>
          <Search aria-hidden="true" data-icon="inline-start" />
          Buscar
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <p role="status">
          {eventos.length === 1 ? "1 evento encontrado" : `${eventos.length} eventos encontrados`}
        </p>
        {filtrando && (
          <Link
            href="/eventos"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Limpar busca
          </Link>
        )}
      </div>

      {eventos.length > 0 ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex">
              <CartaoEvento evento={evento} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Nenhum evento encontrado.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira a grafia ou tente buscar só pela cidade ou pela data.
          </p>
        </div>
      )}
    </>
  );
}

function EsqueletoEventos() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="h-11 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
