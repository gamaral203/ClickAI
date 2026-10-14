import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowRight, Images, Search, ShieldCheck, Zap } from "lucide-react";

import {
  COLAGEM_HERO,
  COLAGEM_HERO_CELULAR,
  type LugarColagem,
  type PainelMosaico,
} from "@/lib/vitrine-inicio";

import { CONTAINER } from "./comum";

const beneficios = [
  { icone: Images, texto: "Milhares de eventos em um só lugar" },
  { icone: ShieldCheck, texto: "Fotos originais e com alta qualidade" },
  { icone: Zap, texto: "Compra segura e download imediato" },
];

/**
 * Hero da página inicial: gradiente do azul elétrico ao azul profundo, o título (o único h1), a
 * busca de eventos e os benefícios. No computador, uma colagem de fotos em cartões arredondados,
 * inclinados e sobrepostos à direita; no celular e no tablet, três cartões ao lado do título. As
 * fotos vêm de src/lib/vitrine-inicio.ts.
 *
 * A busca é o mesmo formulário GET da lista de eventos (`/eventos?busca=`), sem JavaScript.
 */
export function HeroInicio() {
  return (
    <section
      aria-labelledby="titulo-inicio"
      className="relative isolate overflow-hidden bg-linear-150 from-primary from-10% to-profundo to-95% text-white max-md:rounded-b-[1.75rem]"
    >
      <BrilhoFundo />
      <ColagemComputador />
      <div className={`${CONTAINER} relative py-7 md:py-12 lg:py-14`}>
        <div className="flex flex-col gap-5 md:gap-6 lg:max-w-[min(40rem,50%)]">
          <p className="hidden border-l-[3px] border-highlight pl-3 text-xs leading-snug font-semibold tracking-[0.16em] text-white/90 uppercase md:block">
            Fotos que contam
            <br />
            grandes momentos
          </p>

          <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-stretch gap-3 min-[400px]:grid-cols-[minmax(0,1fr)_9rem] md:grid-cols-[minmax(0,1fr)_15rem] md:gap-8 lg:block">
            <div className="flex flex-col gap-3 md:gap-5">
              <h1
                id="titulo-inicio"
                className="text-[clamp(2rem,1rem+5vw,3.25rem)] leading-[1.06] font-extrabold tracking-tight text-balance lg:text-[clamp(2.75rem,0.4rem+3.6vw,3.75rem)] lg:text-wrap"
              >
                As fotos do seu <br className="hidden lg:block" />
                evento<span className="-ml-[0.1em]">,</span> <span className="text-highlight [-webkit-text-stroke:0.022em_currentColor] [paint-order:stroke_fill]">a um clique<span className="-ml-[0.1em]">.</span></span>
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

          <ul className="grid grid-cols-3 divide-x lg:max-xl:grid-cols-[1fr_1.5fr_1.1fr] divide-white/20 text-[0.75rem] leading-snug text-white/90 md:text-sm lg:max-xl:text-[0.8125rem]">
            {beneficios.map(({ icone: Icone, texto }) => (
              <li
                key={texto}
                className="flex flex-col gap-1.5 px-2.5 first:pl-0 last:pr-0 md:flex-row md:items-center md:gap-2.5 md:px-4 lg:max-xl:gap-2 lg:max-xl:px-3"
              >
                <Icone
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-6 shrink-0 text-white lg:max-xl:size-5"
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

/** Brilho suave e textura de pontos sobre o gradiente. */
function BrilhoFundo() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-1/3 -left-1/4 size-[60rem] max-w-none rounded-full bg-[radial-gradient(closest-side,rgb(120_160_255/0.35),transparent)]" />
      <div className="absolute right-[-10%] -bottom-1/2 size-[50rem] max-w-none rounded-full bg-[radial-gradient(closest-side,rgb(184_255_50/0.08),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] [background-size:22px_22px]" />
    </div>
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

const CARTAO =
  "absolute overflow-hidden border-[3px] border-white bg-profundo shadow-[0_18px_40px_-14px_rgb(3_10_35/0.65)]";

/** Três cartões sobrepostos ao lado do título, no celular e no tablet. */
function ColagemCelular() {
  const lugares: CSSProperties[] = [
    { left: "4%", top: "0%", width: "78%", height: "44%", rotate: "-4deg", zIndex: 2 },
    { left: "22%", top: "30%", width: "76%", height: "38%", rotate: "4deg", zIndex: 3 },
    { left: "2%", top: "58%", width: "78%", height: "42%", rotate: "-2deg", zIndex: 1 },
  ];
  return (
    <div className="relative min-h-56 lg:hidden">
      <div
        aria-hidden="true"
        className="absolute top-[6%] left-[16%] h-[48%] w-[78%] rotate-6 rounded-2xl border-2 border-highlight/80"
      />
      {COLAGEM_HERO_CELULAR.map(({ imagem }, i) => (
        <div
          key={imagem.src}
          className={`${CARTAO} rounded-2xl border-2 md:rounded-[1.25rem] md:border-[3px]`}
          style={lugares[i]}
        >
          <Image
            src={imagem.reduzida}
            alt={imagem.alt}
            fill
            sizes="(min-width: 768px) 200px, 112px"
            loading="eager"
            fetchPriority={i === 0 ? "high" : "auto"}
            className="object-cover"
            style={{ objectPosition: imagem.foco }}
          />
        </div>
      ))}
    </div>
  );
}

/** Posição (em % da área da colagem), inclinação e camada de cada cartão do computador. */
const LUGARES_COMPUTADOR: Record<LugarColagem, CSSProperties> = {
  principal: { left: "3%", top: "13%", width: "34%", height: "60%", rotate: "-4deg", zIndex: 20 },
  topo: { left: "33%", top: "5%", width: "38%", height: "30%", rotate: "3deg", zIndex: 10 },
  direita: { left: "70%", top: "11%", width: "27%", height: "45%", rotate: "4deg", zIndex: 15 },
  centroBaixo: {
    left: "36%",
    top: "39%",
    width: "30%",
    height: "38%",
    rotate: "-3deg",
    zIndex: 25,
  },
  direitaBaixo: {
    left: "63%",
    top: "61%",
    width: "33%",
    height: "31%",
    rotate: "3deg",
    zIndex: 30,
  },
  esquerdaBaixo: {
    left: "7%",
    top: "79%",
    width: "29%",
    height: "32%",
    rotate: "3deg",
    zIndex: 22,
  },
};

/**
 * Colagem do computador: fotos espalhadas em cartões arredondados, com molduras coloridas atrás.
 */
function ColagemComputador() {
  const lugares = Object.entries(COLAGEM_HERO) as [LugarColagem, PainelMosaico][];
  return (
    <div className="absolute inset-y-0 right-0 left-[52%] hidden lg:block xl:left-[51%]">
      <div className="absolute inset-y-0 right-3 left-0 min-[1700px]:right-6 min-[1700px]:left-auto min-[1700px]:aspect-[1.45]">
        <MoldurasDecorativas />
        {lugares.map(([lugar, { imagem }]) => (
          <div
            key={lugar}
            className={`${CARTAO} rounded-[1.625rem]`}
            style={LUGARES_COMPUTADOR[lugar]}
          >
            <Image
              src={imagem.src}
              alt={imagem.alt}
              fill
              sizes={
                lugar === "principal" || lugar === "topo"
                  ? "(min-width: 1024px) 20vw, 1px"
                  : "(min-width: 1024px) 17vw, 1px"
              }
              preload={lugar === "principal"}
              className="object-cover"
              style={{ objectPosition: imagem.foco }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Retângulos arredondados atrás dos cartões . */
function MoldurasDecorativas() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute top-[18%] left-[8%] z-[5] h-[60%] w-[34%] -rotate-[9deg] rounded-[1.75rem] border-[3px] border-highlight" />
      <div className="absolute top-[1%] left-[38%] z-[5] h-[30%] w-[38%] rotate-[8deg] rounded-[1.75rem] bg-sky-200/25" />
      <div className="absolute top-[15%] left-[75%] z-[5] h-[45%] w-[24%] rotate-[10deg] rounded-[1.75rem] border-[3px] border-sky-200/50" />
      <div className="absolute top-[55%] left-[68%] z-[5] h-[30%] w-[30%] -rotate-[4deg] rounded-[1.75rem] bg-highlight" />
      <div className="absolute top-[45%] left-[30%] z-[5] h-[36%] w-[30%] rotate-[6deg] rounded-[1.75rem] bg-sky-300/20" />
    </div>
  );
}
