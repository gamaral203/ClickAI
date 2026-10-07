import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Calendar, Camera, Clock, Images, MapPin, ScanFace } from "lucide-react";

import { BuscaNoEvento } from "@/components/galeria/busca-no-evento";
import { contarItens } from "@/components/galeria/cartao-evento";
import { ContagemRegressiva } from "@/components/galeria/contagem-regressiva";
import { FiltrosGaleria } from "@/components/galeria/filtros-galeria";
import { FormularioSenhaEvento } from "@/components/galeria/formulario-senha-evento";
import { GaleriaFotos } from "@/components/galeria/galeria-fotos";
import {
  buscarEventoPublicado,
  eventoTemNumeros,
  listarFotosDoEvento,
  listarOpcoesGaleria,
  listarSlugsPublicados,
  type EventoResumo,
  type FiltroGaleria,
} from "@/dados";
import { formatarData, formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";
import { lerFiltroGaleria } from "@/lib/validacao";

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

export default function PaginaEvento({ params, searchParams }: PageProps<"/eventos/[slug]">) {
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
        <ConteudoEvento params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ConteudoEvento({ params, searchParams }: PageProps<"/eventos/[slug]">) {
  const { slug } = await params;
  const evento = await buscarEventoPublicado(slug);
  if (!evento) notFound();
  const filtro = lerFiltroGaleria(await searchParams);

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

      <Galeria evento={evento} filtro={filtro} />
    </>
  );
}

async function Galeria({ evento, filtro }: { evento: EventoResumo; filtro: FiltroGaleria }) {
  const situacao = evento.situacaoGaleria;

  if (situacao.tipo === "aguardando_liberacao") {
    return (
      <AvisoGaleria icone={Clock} titulo="As fotos ainda não foram liberadas">
        {situacao.liberaEm ? (
          <span className="flex flex-col items-center gap-4">
            O fotógrafo agendou a liberação para {formatarDataEHora(situacao.liberaEm)}.
            <ContagemRegressiva alvo={situacao.liberaEm} />
          </span>
        ) : (
          "O fotógrafo vai liberar as fotos em breve. Volte mais tarde."
        )}
      </AvisoGaleria>
    );
  }
  if (situacao.tipo === "senha") {
    return <FormularioSenhaEvento slug={evento.slug} />;
  }
  const busca = (
    <BuscaNoEvento
      slug={evento.slug}
      tituloEvento={evento.titulo}
      temNumeros={await eventoTemNumeros(evento.id)}
    />
  );
  if (situacao.tipo === "so_apos_busca") {
    return (
      <>
        {busca}
        <AvisoGaleria icone={ScanFace} titulo="As fotos aparecem só pela busca">
          Para proteger quem foi fotografado, neste evento cada pessoa vê só as próprias fotos. Use
          a selfie ou o número de peito acima.
        </AvisoGaleria>
      </>
    );
  }

  const [primeiraPagina, opcoes] = await Promise.all([
    listarFotosDoEvento(evento.id, { limite: FOTOS_POR_PAGINA, filtro }),
    listarOpcoesGaleria(evento.id),
  ]);
  const filtrando = Boolean(filtro.hora || filtro.naoIdentificadas);
  return (
    <>
      {busca}
      <h2 id="galeria" className="scroll-mt-4 text-lg font-semibold">
        {filtrando ? "Fotos filtradas" : "Todas as fotos"}
      </h2>
      <p className="-mt-4 text-sm text-muted-foreground">
        Toque numa foto para ver maior e comprar.
      </p>
      <FiltrosGaleria slug={evento.slug} opcoes={opcoes} filtro={filtro} />
      <GaleriaFotos
        // Novo filtro, nova lista: sem a chave, a galeria manteria as fotos do filtro anterior.
        key={`${filtro.hora ?? ""}|${filtro.naoIdentificadas ? 1 : 0}`}
        slug={evento.slug}
        tituloEvento={evento.titulo}
        paginaInicial={primeiraPagina}
        filtro={filtro}
        vazio={
          filtrando
            ? {
                titulo: "Nenhuma foto com esse filtro.",
                detalhe: "Escolha outro horário ou volte para todas as fotos.",
              }
            : undefined
        }
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
      <div className="max-w-md text-muted-foreground">{children}</div>
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
