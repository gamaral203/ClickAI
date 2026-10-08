import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Camera,
  Download,
  Images,
  MapPin,
  ScanFace,
  Search,
} from "lucide-react";

import { CartaoEvento, contarItens } from "@/components/galeria/cartao-evento";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventoResumo } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";

import type { NumerosDoFotografo } from "./cabecalho-loja";

/** Eventos, fotos e cidades do fotógrafo, para os números do topo. */
export function numerosDoFotografo(eventos: EventoResumo[]): NumerosDoFotografo {
  return {
    eventos: eventos.length,
    fotos: eventos.reduce((soma, e) => soma + e.totalFotos + e.totalVideos, 0),
    cidades: new Set(eventos.map((e) => `${e.cidade}/${e.estado}`.toLowerCase())).size,
  };
}

const passos = [
  { icone: Search, titulo: "Escolha o evento", texto: "Abra o evento em que você estava." },
  { icone: ScanFace, titulo: "Busque pela selfie", texto: "Mostramos só as fotos com você." },
  { icone: Download, titulo: "Baixe em alta", texto: "Pague com Pix ou cartão e baixe na hora." },
];

/**
 * Corpo da página pública do fotógrafo: os 3 passos para achar as fotos, o evento mais recente em
 * destaque e os outros em grade. Com `busca`, mostra o campo de busca (só no /fotografo/<endereço>;
 * a loja no subdomínio não tem parâmetros na URL).
 */
export function VitrineDoFotografo({
  eventos,
  busca,
}: {
  eventos: EventoResumo[];
  busca?: { termo: string; limpar: string; rotulo: string };
}) {
  const termo = busca?.termo ?? "";
  // O destaque só aparece na lista completa: na busca, todos os resultados ficam iguais.
  const destaque = termo ? null : (eventos[0] ?? null);
  const outros = destaque ? eventos.slice(1) : eventos;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <ol className="grid gap-3 sm:grid-cols-3">
        {passos.map(({ icone: Icone, titulo, texto }, i) => (
          <li key={titulo} className="flex items-center gap-3 rounded-xl bg-muted/60 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Icone aria-hidden="true" className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">
                {i + 1}. {titulo}
              </span>
              <span className="text-sm text-muted-foreground">{texto}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight">Eventos</h2>
            <p className="text-sm text-muted-foreground">
              {termo
                ? `${eventos.length} ${eventos.length === 1 ? "resultado" : "resultados"} para “${termo}”`
                : "Encontre o seu evento e veja as fotos."}
            </p>
          </div>
          {busca && (
            <form role="search" className="flex gap-2 sm:w-80">
              <Input
                name="busca"
                type="search"
                defaultValue={termo}
                maxLength={100}
                aria-label={busca.rotulo}
                placeholder="Buscar evento ou cidade"
                className="h-11"
              />
              <button type="submit" className={buttonVariants({ size: "touch" })}>
                <Search aria-hidden="true" />
                <span className="sr-only">Buscar</span>
              </button>
            </form>
          )}
        </div>

        {eventos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted">
              <Camera aria-hidden="true" className="size-7 text-muted-foreground" />
            </span>
            {termo && busca ? (
              <>
                <p className="font-medium">Nenhum evento encontrado para “{termo}”.</p>
                <Link
                  href={busca.limpar}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Ver todos os eventos
                </Link>
              </>
            ) : (
              <>
                <p className="font-medium">Nenhum evento publicado ainda.</p>
                <p className="text-sm text-muted-foreground">Volte em breve para ver as fotos.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {destaque && <EventoEmDestaque evento={destaque} />}
            {outros.length > 0 && (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {outros.map((evento) => (
                  <li key={evento.id} className="flex">
                    <CartaoEvento evento={evento} semFotografo />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** O evento mais recente, grande: foto de um lado e os dados com o botão do outro. */
function EventoEmDestaque({ evento }: { evento: EventoResumo }) {
  return (
    <article className="group relative grid overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg md:grid-cols-[3fr_2fr]">
      <div className="relative aspect-[3/2] bg-muted md:aspect-auto md:min-h-80">
        {evento.capaMiniatura ? (
          <Image
            src={evento.capaMiniatura.urlMiniatura}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 60vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera aria-hidden="true" className="size-10" />
            <span className="text-sm font-medium">Fotos em breve</span>
          </div>
        )}
        <span className="absolute top-4 left-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          Mais recente
        </span>
      </div>
      <div className="flex flex-col gap-4 p-6 sm:p-8">
        <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
          {evento.categoria.nome}
        </span>
        <h3 className="text-2xl leading-tight font-bold text-balance sm:text-3xl">
          <Link
            href={`/eventos/${evento.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-2xl after:focus-visible:ring-3 after:focus-visible:ring-ring/50"
          >
            {evento.titulo}
          </Link>
        </h3>
        <ul className="flex flex-col gap-2 text-muted-foreground">
          <li className="flex items-center gap-2">
            <Calendar aria-hidden="true" className="size-4" />
            {formatarData(evento.inicioEm)}
          </li>
          <li className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-4" />
            {evento.local}, {evento.cidade}/{evento.estado}
          </li>
          <li className="flex items-center gap-2">
            <Images aria-hidden="true" className="size-4" />
            {contarItens(evento)}
          </li>
        </ul>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="text-lg font-semibold">
            {formatarPreco(evento.precoFotoCentavos)}
            <span className="text-sm font-normal text-muted-foreground"> por foto</span>
          </span>
          <span className={buttonVariants({ size: "touch" })}>
            Ver as fotos
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </span>
        </div>
      </div>
    </article>
  );
}
