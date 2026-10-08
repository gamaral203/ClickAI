import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { CabecalhoLoja } from "@/components/loja/cabecalho-loja";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buscarFotografoPublico, buscarLojaDoFotografo, listarEventosPublicados } from "@/dados";
import { corDoTexto } from "@/lib/loja";
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
  const [eventos, salva] = await Promise.all([
    listarEventosPublicados({
      fotografoId: fotografo.id,
      ...(termo && { busca: termo }),
    }),
    buscarLojaDoFotografo(fotografo.id),
  ]);
  // O que o fotógrafo configurou em Minha loja (nome, descrição e cores) vale aqui também.
  const loja = salva?.ativa ? salva : null;
  const corPrimaria = loja?.corPrimaria ?? "#2362FE";
  const corSecundaria = loja?.corSecundaria ?? "#BCFA34";

  return (
    <div
      className="contents"
      style={
        loja
          ? ({
              "--primary": corPrimaria,
              "--primary-foreground": corDoTexto(corPrimaria),
              "--ring": corPrimaria,
            } as React.CSSProperties)
          : undefined
      }
    >
      <CabecalhoLoja
        nome={loja?.nome ?? fotografo.nomePublico}
        descricao={loja?.descricao ?? fotografo.bio}
        capa={fotografo.capa}
        logo={fotografo.fotoPerfil}
        corPrimaria={corPrimaria}
        corSecundaria={corSecundaria}
        redes={fotografo.redesSociais}
        className="rounded-2xl"
      />

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
    </div>
  );
}
