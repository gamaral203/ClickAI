import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Calendar, Camera, Clock, Images, Lock, MapPin, ScanFace } from "lucide-react";

import { contarItens } from "@/components/galeria/cartao-evento";
import { GaleriaFotos } from "@/components/galeria/galeria-fotos";
import {
  buscarEventoPublicado,
  listarFotosDoEvento,
  listarSlugsPublicados,
  type EventoResumo,
} from "@/dados";
import { formatarData, formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";

export async function generateStaticParams() {
  const slugs = await listarSlugsPublicados();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/eventos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const evento = await buscarEventoPublicado(slug);
  if (!evento) return { title: "Evento não encontrado" };
  return {
    title: evento.titulo,
    description: `${contarItens(evento)} de ${evento.titulo}, ${formatarData(evento.inicioEm)}, ${evento.cidade}.`,
    // Não listado e com senha ficam fora do Google (docs/arquitetura.md, Galeria e busca).
    robots: evento.visibilidade === "publico" ? undefined : { index: false, follow: false },
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

  return (
    <>
      <header className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-primary">{evento.categoria.nome}</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {evento.titulo}
        </h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
          <div className="flex items-center gap-2">
            <dt>
              <Calendar aria-hidden="true" className="size-4" />
              <span className="sr-only">Data</span>
            </dt>
            <dd>{formatarData(evento.inicioEm)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <MapPin aria-hidden="true" className="size-4" />
              <span className="sr-only">Local</span>
            </dt>
            <dd>
              {evento.local} · {evento.cidade}, {evento.estado}
            </dd>
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
              <span className="sr-only">Quantidade de itens</span>
            </dt>
            <dd>{contarItens(evento)}</dd>
          </div>
        </dl>
        <p className="w-fit rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          Cada foto custa <strong>{formatarPreco(evento.precoFotoCentavos)}</strong>
          {evento.totalVideos > 0 && (
            <>
              {" "}
              e cada vídeo <strong>{formatarPreco(evento.precoVideoCentavos)}</strong>
            </>
          )}
          .
        </p>
      </header>

      <Galeria evento={evento} />
    </>
  );
}

async function Galeria({ evento }: { evento: EventoResumo }) {
  const situacao = evento.situacaoGaleria;

  if (situacao.tipo === "aguardando_liberacao") {
    return (
      <AvisoGaleria icone={Clock} titulo="As fotos ainda não foram liberadas">
        {situacao.liberaEm
          ? `O fotógrafo agendou a liberação para ${formatarDataEHora(situacao.liberaEm)}.`
          : "O fotógrafo vai liberar as fotos em breve. Volte mais tarde."}
      </AvisoGaleria>
    );
  }
  if (situacao.tipo === "senha") {
    // A tela de senha entra na Fase 7 (docs/tarefas.md).
    return (
      <AvisoGaleria icone={Lock} titulo="Este evento é protegido por senha">
        Peça a senha a quem organizou o evento. O acesso com senha chega em breve.
      </AvisoGaleria>
    );
  }
  if (situacao.tipo === "so_apos_busca") {
    // A busca por selfie e por número de peito entra na Fase 7.
    return (
      <AvisoGaleria icone={ScanFace} titulo="Encontre suas fotos pela busca">
        Neste evento, as fotos aparecem só depois da busca por selfie ou número de peito. A busca
        chega em breve.
      </AvisoGaleria>
    );
  }

  const primeiraPagina = await listarFotosDoEvento(evento.id, { limite: FOTOS_POR_PAGINA });
  return (
    <>
      <p className="-mt-4 text-sm text-muted-foreground">
        Toque numa foto para ver maior e comprar.
      </p>
      <GaleriaFotos
        slug={evento.slug}
        tituloEvento={evento.titulo}
        paginaInicial={primeiraPagina}
      />
    </>
  );
}

function AvisoGaleria({
  icone: Icone,
  titulo,
  children,
}: {
  icone: typeof Clock;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icone aria-hidden="true" className="size-6" />
      </span>
      <p className="text-lg font-semibold">{titulo}</p>
      <p className="max-w-md text-muted-foreground">{children}</p>
    </div>
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
