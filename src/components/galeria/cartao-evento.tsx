import Image from "next/image";
import Link from "next/link";
import { Calendar, Camera, Images, MapPin } from "lucide-react";

import type { EventoResumo } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";

export function CartaoEvento({ evento }: { evento: EventoResumo }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-[3/2] bg-muted">
        {evento.capa && (
          <Image
            src={evento.capa.urlMiniatura}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
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
        </dl>
        <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Images aria-hidden="true" className="size-4" />
            {evento.totalFotos} fotos
          </span>
          <span className="font-semibold">
            {formatarPreco(evento.precoPadraoCentavos)}
            <span className="font-normal text-muted-foreground"> por foto</span>
          </span>
        </div>
      </div>
    </article>
  );
}
