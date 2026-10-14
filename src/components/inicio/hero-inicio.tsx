import Image from "next/image";
import { ArrowRight, Images, Search, ShieldCheck, Zap } from "lucide-react";

import { COLAGEM_HERO, MOSAICO_HERO } from "@/lib/vitrine-inicio";

import { CONTAINER } from "./comum";

const beneficios = [
  { icone: Images, texto: "Milhares de eventos em um só lugar" },
  { icone: ShieldCheck, texto: "Fotos originais e com alta qualidade" },
  { icone: Zap, texto: "Compra segura e download imediato" },
];

/**
 * Hero da página inicial: gradiente do azul elétrico ao azul profundo, o título (o único h1), a
 * busca de eventos e os benefícios. No computador, o mosaico de fotos em painéis inclinados à
 * direita; no celular e no tablet, uma colagem de três fotos ao lado do título. As fotos vêm de
 * src/lib/vitrine-inicio.ts.
 *
 * A busca é o mesmo formulário GET da lista de eventos (`/eventos?busca=`), sem JavaScript.
 */
export function HeroInicio() {
  return (
    <section
      aria-labelledby="titulo-inicio"
      className="relative overflow-hidden bg-linear-150 from-primary from-10% to-profundo to-95% text-white max-md:rounded-b-[1.75rem]"
    >
      <MosaicoComputador />
      <div className={`${CONTAINER} relative py-7 md:py-12 lg:py-16`}>
        <div className="flex flex-col gap-5 md:gap-6 lg:max-w-[min(38rem,55%)] xl:max-w-[min(38rem,50%)]">
          <p className="hidden border-l-[3px] border-highlight pl-3 text-xs leading-snug font-semibold tracking-[0.16em] text-white/90 uppercase md:block">
            Fotos que contam
            <br />
            grandes momentos
          </p>

          <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-stretch gap-3 min-[400px]:grid-cols-[minmax(0,1fr)_8rem] md:grid-cols-[minmax(0,1fr)_16rem] md:gap-6 lg:block">
            <div className="flex flex-col gap-3 md:gap-5">
              <h1
                id="titulo-inicio"
                className="text-[clamp(2rem,1rem+5vw,3.25rem)] leading-[1.02] font-extrabold tracking-tight text-balance lg:text-[clamp(3.25rem,1.2rem+3.4vw,4.5rem)]"
              >
                As fotos do seu evento, <span className="text-highlight">a um clique.</span>
              </h1>
              <p className="text-[0.8125rem] leading-relaxed text-pretty text-white/90 md:text-lg lg:max-w-lg">
                Fotógrafos publicam as fotos de corridas, festas, formaturas, vaquejadas, casamentos
                e esportes. Você encontra as suas, paga e baixa o original, de forma rápida e
                segura.
              </p>
            </div>
            <ColagemCelular />
          </div>

          <BuscaHero />

          <ul className="grid grid-cols-3 gap-2 text-[0.75rem] leading-snug text-white/90 md:gap-4 md:text-sm">
            {beneficios.map(({ icone: Icone, texto }) => (
              <li
                key={texto}
                className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2.5"
              >
                <Icone
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-6 shrink-0 text-white"
                />
                <span className="text-pretty">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function BuscaHero() {
  return (
    <form
      action="/eventos"
      role="search"
      className="flex h-14 w-full items-center gap-2 rounded-full bg-white p-1.5 pl-4 text-foreground shadow-[0_8px_24px_-12px_rgb(6_26_66/0.5)] focus-within:ring-3 focus-within:ring-highlight/70 md:h-16 md:pl-5"
    >
      <label htmlFor="busca-inicio" className="sr-only">
        Procure pelo evento em que participou
      </label>
      <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <input
        id="busca-inicio"
        name="busca"
        type="search"
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Procure pelo evento em que participou"
        className="h-full min-w-0 flex-1 bg-transparent text-base text-ellipsis outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="submit"
        className="group inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-full bg-highlight font-semibold text-highlight-foreground transition-colors hover:brightness-95 focus-visible:ring-3 focus-visible:ring-profundo/60 focus-visible:outline-none sm:w-auto sm:px-5 md:h-13"
      >
        <span className="sr-only sm:not-sr-only">Encontrar meu evento</span>
        <ArrowRight
          aria-hidden="true"
          className="size-5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none sm:size-4"
        />
      </button>
    </form>
  );
}

/** Três fotos inclinadas ao lado do título, no celular e no tablet. */
function ColagemCelular() {
  return (
    <div className="flex -skew-x-6 flex-col gap-1.5 lg:hidden">
      {COLAGEM_HERO.map(({ imagem }, i) => (
        <div
          key={imagem.src}
          className={`relative min-h-0 flex-1 overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/15 ${
            i === 1 ? "-ml-3" : ""
          }`}
        >
          <Image
            src={imagem.reduzida}
            alt={imagem.alt}
            fill
            sizes="(min-width: 768px) 256px, 128px"
            loading="eager"
            fetchPriority={i === 0 ? "high" : "auto"}
            className="scale-110 skew-x-6 object-cover"
            style={{ objectPosition: imagem.foco }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Mosaico do computador: colunas de painéis inclinados, separados por faixas azuis (o fundo do
 * mosaico aparece entre eles). A inclinação vai no conjunto e a foto é endireitada dentro.
 */
function MosaicoComputador() {
  return (
    <div className="absolute inset-y-0 right-0 hidden w-[42%] lg:block xl:w-[50%]">
      <div className="absolute -inset-y-6 right-[-4%] left-[6%] flex -skew-x-[9deg] gap-2.5 bg-primary px-2.5">
        {MOSAICO_HERO.map((coluna, c) => (
          <div key={c} className="flex flex-1 flex-col gap-2.5">
            {coluna.paineis.map(({ imagem, peso }) => (
              <div
                key={imagem.src}
                className="relative min-h-0 overflow-hidden bg-profundo"
                style={{ flexGrow: peso, flexBasis: 0 }}
              >
                <Image
                  src={imagem.src}
                  alt={imagem.alt}
                  fill
                  sizes="(min-width: 1024px) 18vw, 1px"
                  className="scale-[1.18] skew-x-[9deg] object-cover"
                  style={{ objectPosition: imagem.foco }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
