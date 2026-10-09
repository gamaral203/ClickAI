import Link from "next/link";
import { Camera, Download, ScanFace, Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventoResumo } from "@/dados";

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
 * Corpo da página pública do fotógrafo: os 3 passos para achar as fotos e os eventos em grade.
 * Com `busca`, mostra o campo de busca (só no /fotografo/<endereço>; a loja no subdomínio não tem
 * parâmetros na URL).
 */
export function VitrineDoFotografo({
  eventos,
  busca,
}: {
  eventos: EventoResumo[];
  busca?: { termo: string; limpar: string; rotulo: string };
}) {
  const termo = busca?.termo ?? "";

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
          <ul className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {eventos.map((evento) => (
              <li key={evento.id} className="flex">
                <CartaoEvento evento={evento} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
