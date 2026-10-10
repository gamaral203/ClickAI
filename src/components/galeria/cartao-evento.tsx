import Image from "next/image";
import Link from "next/link";
import { Calendar, Camera, Images, Lock, MapPin } from "lucide-react";

import type { EventoResumo } from "@/dados";
import { formatarPeriodo, formatarPreco } from "@/lib/formatar";

/**
 * Cartão do evento nas listas. No celular as listas têm 2 colunas, então o cartão fica compacto
 * (texto menor, sem o nome do fotógrafo e com o preço embaixo da quantidade); do tablet em
 * diante, volta ao tamanho normal.
 */
export function CartaoEvento({ evento }: { evento: EventoResumo }) {
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[3/2] bg-muted">
        {evento.capaMiniatura ? (
          <Image
            src={evento.capaMiniatura.urlMiniatura}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          // Sem capa: galeria ainda fechada (liberação, senha ou só após a busca).
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera aria-hidden="true" className="size-6 sm:size-8" />
            <span className="text-xs font-medium sm:text-sm">
              {evento.visibilidade === "senha" ? "Fotos protegidas" : "Fotos em breve"}
            </span>
          </div>
        )}
        <span className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold sm:top-3 sm:left-3 sm:px-2.5 sm:py-1 sm:text-xs">
          {evento.categoria.nome}
        </span>
        {evento.visibilidade === "senha" && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/90 p-1.5 text-xs font-semibold sm:top-3 sm:right-3 sm:px-2.5 sm:py-1">
            <Lock aria-hidden="true" className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Com senha</span>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-4">
        <h2 className="line-clamp-2 text-sm leading-snug font-semibold text-balance sm:text-lg">
          {/* O link cobre o cartão inteiro, mas só o título é lido pelo leitor de tela. */}
          <Link
            href={`/eventos/${evento.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-xl after:focus-visible:ring-3 after:focus-visible:ring-ring/50"
          >
            {evento.titulo}
          </Link>
        </h2>
        <dl className="grid gap-1 text-xs text-muted-foreground sm:gap-1.5 sm:text-sm">
          <div className="flex items-center gap-2">
            <dt>
              <Calendar aria-hidden="true" className="size-3.5 sm:size-4" />
              <span className="sr-only">Data</span>
            </dt>
            <dd>{formatarPeriodo(evento.inicioEm, evento.fimEm)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <MapPin aria-hidden="true" className="size-3.5 sm:size-4" />
              <span className="sr-only">Cidade</span>
            </dt>
            <dd className="truncate">
              {evento.cidade}, {evento.estado}
            </dd>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <dt>
              <Camera aria-hidden="true" className="size-4" />
              <span className="sr-only">Fotógrafo</span>
            </dt>
            <dd>{evento.fotografo.nomePublico}</dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-col gap-0.5 border-t pt-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:pt-3 sm:text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Images aria-hidden="true" className="size-3.5 sm:size-4" />
            {contarItens(evento)}
          </span>
          <span className="font-semibold">
            {formatarPreco(evento.precoFotoCentavos)}
            <span className="font-normal text-muted-foreground"> por foto</span>
          </span>
        </div>
      </div>
    </article>
  );
}

export function contarItens({ totalFotos, totalVideos }: EventoResumo) {
  const fotos = totalFotos === 1 ? "1 foto" : `${totalFotos} fotos`;
  if (totalVideos === 0) return fotos;
  return `${fotos} e ${totalVideos === 1 ? "1 vídeo" : `${totalVideos} vídeos`}`;
}
