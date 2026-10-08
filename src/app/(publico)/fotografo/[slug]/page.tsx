import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Camera, Globe, Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscarFotografoPublico, listarEventosPublicados, type Fotografo } from "@/dados";
import { FORMATO_SLUG } from "@/lib/slug";

// Link do fotógrafo: /fotografo/<endereço>. Todo fotógrafo tem o seu, sem configurar nada, para
// divulgar o trabalho: quem entra vê só os eventos dele. (A loja própria, com nome, cores e
// domínio, continua opcional em Minha loja.)

async function carregar(params: PageProps<"/fotografo/[slug]">["params"]) {
  const { slug } = await params;
  return FORMATO_SLUG.test(slug) ? buscarFotografoPublico(slug) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/fotografo/[slug]">): Promise<Metadata> {
  const fotografo = await carregar(params);
  if (!fotografo) return { title: "Fotógrafo não encontrado" };
  return {
    title: fotografo.nomePublico,
    description: fotografo.bio ?? `Fotos dos eventos de ${fotografo.nomePublico} no ClicouAí.`,
  };
}

export default function PaginaFotografo({ params, searchParams }: PageProps<"/fotografo/[slug]">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/fotografo/[slug]">) {
  const fotografo = await carregar(params);
  if (!fotografo) notFound();
  const { busca } = await searchParams;
  const termo = typeof busca === "string" ? busca.trim().slice(0, 100) : "";
  const eventos = await listarEventosPublicados({
    fotografoId: fotografo.id,
    ...(termo && { busca: termo }),
  });

  return (
    <>
      <header className="flex flex-col gap-3 rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-highlight text-xl font-bold text-highlight-foreground"
        >
          {fotografo.nomePublico.trim().charAt(0).toUpperCase()}
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {fotografo.nomePublico}
        </h1>
        {fotografo.bio && <p className="max-w-2xl text-lg opacity-90">{fotografo.bio}</p>}
        <Redes fotografo={fotografo} />
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl font-semibold">Eventos</h2>
          <form role="search" className="flex gap-2 sm:w-80">
            <Input
              name="busca"
              type="search"
              defaultValue={termo}
              maxLength={100}
              aria-label={`Buscar nos eventos de ${fotografo.nomePublico}`}
              placeholder="Buscar evento ou cidade"
              className="h-11"
            />
            <button type="submit" className={buttonVariants({ size: "touch" })}>
              <Search aria-hidden="true" />
              <span className="sr-only">Buscar</span>
            </button>
          </form>
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
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            {termo ? (
              <>
                Nenhum evento encontrado para “{termo}”.{" "}
                <Link href={`/fotografo/${fotografo.slug}`} className="font-medium text-primary">
                  Ver todos
                </Link>
              </>
            ) : (
              "Nenhum evento publicado ainda. Volte em breve."
            )}
          </div>
        )}
      </section>
    </>
  );
}

function Redes({ fotografo }: { fotografo: Fotografo }) {
  const { instagram, site } = fotografo.redesSociais;
  // Só https: um "javascript:" salvo no perfil nunca vira link.
  const siteSeguro = site && /^https:\/\//i.test(site) ? site : null;
  if (!instagram && !siteSeguro) return null;
  return (
    <div className="flex flex-wrap gap-4 text-sm font-medium">
      {instagram && (
        <a
          href={`https://instagram.com/${encodeURIComponent(instagram.replace(/^@/, ""))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Camera aria-hidden="true" className="size-4" />@{instagram.replace(/^@/, "")}
        </a>
      )}
      {siteSeguro && (
        <a
          href={siteSeguro}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Globe aria-hidden="true" className="size-4" />
          {new URL(siteSeguro).host}
        </a>
      )}
    </div>
  );
}
