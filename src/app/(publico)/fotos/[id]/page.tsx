import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buscarFotoPublica } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";
import { ehIdValido } from "@/lib/validacao";

async function carregar(id: string) {
  return ehIdValido(id) ? buscarFotoPublica(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/fotos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const dados = await carregar(id);
  if (!dados) return { title: "Foto não encontrada" };
  return {
    title: `Foto ${dados.posicao} — ${dados.evento.titulo}`,
    description: `Foto de ${dados.evento.titulo}, ${formatarData(dados.evento.data)}, ${dados.evento.cidade}.`,
  };
}

export default function PaginaFoto({ params }: PageProps<"/fotos/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<EsqueletoFoto />}>
        <ConteudoFoto params={params} />
      </Suspense>
    </div>
  );
}

async function ConteudoFoto({ params }: Pick<PageProps<"/fotos/[id]">, "params">) {
  const { id } = await params;
  const dados = await carregar(id);
  if (!dados) notFound();
  const { foto, evento, posicao, anteriorId, proximaId } = dados;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/eventos/${evento.slug}`}
        className="inline-flex h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para {evento.titulo}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <figure className="flex flex-col gap-3">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-xl bg-muted"
            style={{ aspectRatio: `${foto.largura} / ${foto.altura}`, maxHeight: "75vh" }}
          >
            <Image
              src={foto.urlPrevia}
              alt={`Foto ${posicao} de ${evento.titulo}`}
              fill
              loading="eager"
              sizes="(min-width: 1024px) 800px, 100vw"
              className="object-contain"
            />
          </div>
          <figcaption className="text-sm text-muted-foreground">
            Prévia com marca d&apos;água. O original sai sem marca e em alta resolução.
          </figcaption>
        </figure>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              Foto {posicao} de {evento.totalFotos}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-balance">{evento.titulo}</h1>
            <p className="text-muted-foreground">
              {formatarData(evento.data)} · {evento.cidade}
            </p>
            <p className="text-muted-foreground">Por {evento.fotografo.nomePublico}</p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <p className="text-3xl font-bold">{formatarPreco(foto.precoCentavos)}</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Download aria-hidden="true" className="size-4 shrink-0" />
                Original em alta resolução, sem marca d&apos;água
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
                Pagamento por Pix ou cartão
              </li>
            </ul>
            {/* O botão de adicionar ao carrinho entra na Fase 3 (docs/tarefas.md). */}
          </div>

          <nav aria-label="Navegar entre as fotos do evento" className="flex gap-3">
            {anteriorId ? (
              <Link
                href={`/fotos/${anteriorId}`}
                className={cn(buttonVariants({ variant: "outline", size: "touch" }), "flex-1")}
              >
                <ChevronLeft aria-hidden="true" data-icon="inline-start" />
                Anterior
              </Link>
            ) : (
              <span className="flex-1" />
            )}
            {proximaId && (
              <Link
                href={`/fotos/${proximaId}`}
                className={cn(buttonVariants({ variant: "outline", size: "touch" }), "flex-1")}
              >
                Próxima
                <ChevronRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            )}
          </nav>
        </aside>
      </div>
    </div>
  );
}

function EsqueletoFoto() {
  return (
    <div aria-hidden="true" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="aspect-[3/2] animate-pulse rounded-xl bg-muted" />
      <div className="flex flex-col gap-4">
        <div className="h-8 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
