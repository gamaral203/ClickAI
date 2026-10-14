import { getImageProps } from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Footprints,
  Gem,
  Lasso,
  PartyPopper,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import {
  CATEGORIAS_INICIO,
  type IconeCategoria,
  type ImagemVitrine,
  linkDaCategoria,
} from "@/lib/vitrine-inicio";

import { CabecalhoSecao, CONTAINER, TRILHO } from "./comum";

const ICONES: Record<IconeCategoria, LucideIcon> = {
  casamentos: Gem,
  corridas: Footprints,
  festas: PartyPopper,
  vaquejadas: Lasso,
  esportes: Trophy,
};

/**
 * Foto do cartão. No celular, o cartão tem uns 100 px de largura: vai a versão pequena (até
 * 600 px); do tablet em diante, a reduzida. As imagens não passam pelo otimizador (next.config),
 * então a troca é por <picture>, que só baixa a versão da tela.
 */
function FotoCategoria({ imagem }: { imagem: ImagemVitrine }) {
  const comum = {
    alt: "",
    fill: true,
    sizes: "(min-width: 1280px) 200px, (min-width: 768px) 30vw, 28vw",
  };
  const {
    props: { srcSet: maior },
  } = getImageProps({ ...comum, src: imagem.reduzida });
  const { props } = getImageProps({ ...comum, src: imagem.pequena ?? imagem.reduzida });
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={maior ?? imagem.reduzida} />
      <img
        {...props}
        alt=""
        className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
        style={{ ...props.style, objectPosition: imagem.foco }}
      />
    </picture>
  );
}

/**
 * As 5 categorias populares (src/lib/vitrine-inicio.ts). Cada cartão leva para /eventos já
 * filtrado pela categoria. No celular, carrossel com uns 3 cartões à vista (o próximo cortado na borda); no tablet,
 * 5 por linha a partir de 768 px.
 */
export function CategoriasPopulares() {
  return (
    <section aria-labelledby="titulo-categorias" className={`${CONTAINER} py-7 md:py-10`}>
      <CabecalhoSecao
        id="titulo-categorias"
        titulo="Categorias populares"
        subtitulo="Encontre suas fotos por tipo de evento"
        link={{ href: "/eventos", curto: "Ver todas", longo: "Ver todas as categorias" }}
      />
      <ul className={`${TRILHO} mt-4 md:mt-6 md:grid-cols-5 md:gap-3 xl:gap-4`}>
        {CATEGORIAS_INICIO.map((categoria) => {
          const Icone = ICONES[categoria.icone];
          const conteudo = (
            <>
              <span className="relative block aspect-[5/4] overflow-hidden bg-linear-135 from-primary to-profundo">
                {categoria.imagem ? (
                  <FotoCategoria imagem={categoria.imagem} />
                ) : (
                  // Sem foto ainda: o fundo da marca com o ícone grande.
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Icone
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="size-10 text-highlight md:size-12"
                    />
                  </span>
                )}
              </span>
              <span className="flex flex-1 flex-col items-center gap-1 px-1.5 py-2.5 text-center md:flex-row md:gap-2.5 md:px-3 md:py-3 md:text-left">
                <Icone
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-5 shrink-0 text-foreground"
                />
                <span className="flex-1 text-[0.8125rem] leading-tight font-semibold md:text-sm">
                  {categoria.nome}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="hidden size-4 shrink-0 text-primary xl:block"
                />
              </span>
            </>
          );
          const estilo =
            "group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors";
          return (
            <li
              key={categoria.nome}
              className="w-[28vw] max-w-36 min-w-26 shrink-0 snap-start md:w-auto md:max-w-none md:min-w-0"
            >
              {categoria.slug ? (
                <Link
                  href={linkDaCategoria(categoria.slug)}
                  className={`${estilo} hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                >
                  {conteudo}
                </Link>
              ) : (
                <div className={estilo}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
