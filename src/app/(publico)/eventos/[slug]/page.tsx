import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Calendar, Camera, Images, MapPin } from "lucide-react";

import { GaleriaFotos } from "@/components/galeria/galeria-fotos";
import { buscarEventoPublicado, listarEventosPublicados, listarFotosDoEvento } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";

export async function generateStaticParams() {
  const eventos = await listarEventosPublicados();
  return eventos.map((evento) => ({ slug: evento.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/eventos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const evento = await buscarEventoPublicado(slug);
  if (!evento) return { title: "Evento não encontrado" };
  return {
    title: evento.titulo,
    description: `${evento.totalFotos} fotos de ${evento.titulo}, ${formatarData(evento.data)}, ${evento.cidade}.`,
  };
}

export default function PaginaEvento({ params }: PageProps<"/eventos/[slug]">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <Link
        href="/eventos"
        className="inline-flex h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Todos os eventos
      </Link>
      <Suspense fallback={<EsqueletoEvento />}>
        <ConteudoEvento params={params} />
      </Suspense>
    </div>
  );
}

async function ConteudoEvento({ params }: Pick<PageProps<"/eventos/[slug]">, "params">) {
  const { slug } = await params;
  const evento = await buscarEventoPublicado(slug);
  if (!evento) notFound();

  const primeiraPagina = await listarFotosDoEvento(evento.id, { limite: FOTOS_POR_PAGINA });

  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {evento.titulo}
        </h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
          <div className="flex items-center gap-2">
            <dt>
              <Calendar aria-hidden="true" className="size-4" />
              <span className="sr-only">Data</span>
            </dt>
            <dd>{formatarData(evento.data)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <MapPin aria-hidden="true" className="size-4" />
              <span className="sr-only">Cidade</span>
            </dt>
            <dd>{evento.cidade}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <Camera aria-hidden="true" className="size-4" />
              <span className="sr-only">Fotógrafo</span>
            </dt>
            <dd>{evento.fotografo.nomePublico}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <Images aria-hidden="true" className="size-4" />
              <span className="sr-only">Quantidade de fotos</span>
            </dt>
            <dd>{evento.totalFotos} fotos</dd>
          </div>
        </dl>
        <p className="w-fit rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          Cada foto custa <strong>{formatarPreco(evento.precoPadraoCentavos)}</strong>. Toque numa
          foto para ver maior e comprar.
        </p>
      </header>

      <GaleriaFotos
        slug={evento.slug}
        tituloEvento={evento.titulo}
        paginaInicial={primeiraPagina}
      />
    </>
  );
}

function EsqueletoEvento() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
