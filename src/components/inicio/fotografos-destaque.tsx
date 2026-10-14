import Image from "next/image";
import Link from "next/link";

import { avatarDoFotografo, urlDoAvatar } from "@/lib/avatares";
import type { FotografoDaInicial } from "@/lib/selecao-inicio";

import { CabecalhoSecao, CONTAINER, TRILHO_ATE_LG } from "./comum";

/**
 * Fotógrafos em destaque: quem publicou os eventos mais recentes (src/lib/selecao-inicio.ts), com
 * a foto de perfil (ou o avatar), o nome e as categorias em que mais publica. Sem notas nem
 * avaliações: o ClicouAí não tem esse dado. "Ver perfil" abre a página pública do fotógrafo.
 */
export function FotografosEmDestaque({ fotografos }: { fotografos: FotografoDaInicial[] }) {
  if (fotografos.length === 0) return null;
  return (
    <section aria-labelledby="titulo-fotografos" className={`${CONTAINER} py-7 md:py-10`}>
      <CabecalhoSecao id="titulo-fotografos" titulo="Fotógrafos em destaque" />
      <ul className={`${TRILHO_ATE_LG} mt-4 md:mt-6 lg:grid-cols-4`}>
        {fotografos.map(({ fotografo, especialidades }) => (
          <li
            key={fotografo.id}
            className="w-[40vw] max-w-44 shrink-0 snap-start md:w-52 md:max-w-none lg:w-auto"
          >
            <article className="relative flex h-full flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center">
              <span className="relative block size-16 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-accent md:size-20">
                <Image
                  src={urlDoAvatar(fotografo)}
                  alt={
                    fotografo.fotoPerfil
                      ? `Foto de ${fotografo.nomePublico}`
                      : avatarDoFotografo(fotografo).nome
                  }
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </span>
              <h3 className="line-clamp-2 text-sm leading-snug font-bold md:text-base">
                {fotografo.nomePublico}
              </h3>
              {especialidades.length > 0 && (
                <p className="line-clamp-2 text-[0.8125rem] text-muted-foreground md:text-sm">
                  {especialidades.join(" · ")}
                </p>
              )}
              <Link
                href={`/fotografo/${fotografo.slug}`}
                className="mt-auto inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Ver perfil
                <span className="sr-only"> de {fotografo.nomePublico}</span>
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
