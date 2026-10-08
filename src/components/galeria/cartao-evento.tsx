import Image from "next/image";
import Link from "next/link";
import { Calendar, Camera, Images, Lock, MapPin } from "lucide-react";

import type { EventoResumo } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";

export function CartaoEvento({
  evento,
  semFotografo = false,
}: {
  evento: EventoResumo;
  /** Na página do próprio fotógrafo, o nome dele em cada cartão só repete o topo. */
  semFotografo?: boolean;
}) {
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[3/2] bg-muted">
        {evento.capaMiniatura ? (
          <Image
            src={evento.capaMiniatura.urlMiniatura}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          // Sem capa: galeria ainda fechada (liberação, senha ou só após a busca).
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera aria-hidden="true" className="size-8" />
            <span className="text-sm font-medium">
              {evento.visibilidade === "senha" ? "Fotos protegidas" : "Fotos em breve"}
            </span>
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold">
          {evento.categoria.nome}
        </span>
        {evento.visibilidade === "senha" && (
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold">
            <Lock aria-hidden="true" className="size-3.5" />
            Com senha
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="text-lg leading-snug font-semibold text-balance">
          {/* O link cobre o cartão inteiro, mas só o título é lido pelo leitor de tela. */}
          <Link
            href={`/eventos/${evento.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-xl after:focus-visible:ring-3 after:focus-visible:ring-ring/50"
          >
            {evento.titulo}
          </Link>
        </h2>
        <dl className="grid gap-1.5 text-sm text-muted-foreground">
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
              <span className="sr-only">Cidade</span>
            </dt>
            <dd>
              {evento.cidade}, {evento.estado}
            </dd>
          </div>
          {!semFotografo && (
            <div className="flex items-center gap-2">
              <dt>
                <Camera aria-hidden="true" className="size-4" />
                <span className="sr-only">Fotógrafo</span>
              </dt>
              <dd>{evento.fotografo.nomePublico}</dd>
            </div>
          )}
        </dl>
        <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Images aria-hidden="true" className="size-4" />
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
