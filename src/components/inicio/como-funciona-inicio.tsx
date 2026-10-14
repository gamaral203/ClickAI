import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Download, ImageIcon, Search } from "lucide-react";

import { CabecalhoSecao, CONTAINER } from "./comum";

const passos = [
  {
    icone: Search,
    titulo: "Encontre seu evento",
    texto: "Procure pelo nome, pela data ou pelo local do evento em que você participou.",
  },
  {
    icone: ImageIcon,
    titulo: "Encontre suas fotos",
    texto: "Veja as fotos publicadas pelos fotógrafos do evento e escolha as suas.",
  },
  {
    icone: Download,
    titulo: "Pague e baixe",
    texto: "Pague com Pix ou cartão, com segurança, e baixe na hora a foto original.",
  },
];

/**
 * Como funciona, em 3 passos. No celular, um embaixo do outro (o número e o ícone à esquerda, o
 * texto à direita); a partir de 640 px, lado a lado.
 */
export function ComoFuncionaInicio() {
  return (
    <section aria-labelledby="titulo-como-funciona" className={`${CONTAINER} py-7 md:py-10`}>
      <CabecalhoSecao
        id="titulo-como-funciona"
        titulo="Como funciona"
        link={{ href: "/como-funciona", curto: "Saiba mais" }}
      />
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 md:mt-6 md:gap-4">
        {passos.map(({ icone: Icone, titulo, texto }, i) => (
          <li
            key={titulo}
            className="flex gap-3 rounded-xl border bg-card p-4 sm:flex-col sm:gap-2 sm:p-3 md:gap-3 md:p-6"
          >
            <div className="flex shrink-0 flex-col items-center gap-2 sm:flex-row md:gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-highlight text-sm font-extrabold text-highlight-foreground tabular-nums md:size-7">
                {i + 1}
              </span>
              <Icone
                aria-hidden="true"
                strokeWidth={1.75}
                className="size-5 text-primary md:size-7"
              />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base leading-snug font-bold sm:text-[0.8125rem] md:text-lg">
                {titulo}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-xs md:text-sm">
                {texto}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Faixa para os fotógrafos, em azul profundo. A taxa vem do sistema (a comissão padrão da conta
 * de fotógrafo, src/dados): "a partir de", porque o saque antecipado paga mais.
 */
export function BannerFotografos({ comissaoPct }: { comissaoPct: number }) {
  return (
    <section
      aria-labelledby="titulo-banner-fotografos"
      className={`${CONTAINER} pt-4 pb-12 md:pb-16`}
    >
      <div className="relative isolate overflow-hidden rounded-2xl bg-profundo px-5 py-6 text-white md:px-10 md:py-12">
        {/* Detalhe da marca: um círculo do azul elétrico saindo pela direita. */}
        <span
          aria-hidden="true"
          className="absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-primary/35 blur-2xl md:size-96"
        />
        <div className="flex items-center gap-4 md:gap-10">
          <div className="hidden shrink-0 lg:block">
            <Image src="/logo-clara.png" alt="" width={544} height={160} className="h-10 w-auto" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:gap-2">
            <h2
              id="titulo-banner-fotografos"
              className="text-lg leading-tight font-extrabold tracking-tight text-balance md:text-2xl lg:text-3xl"
            >
              <span className="md:hidden">Fotógrafos, publiquem seus eventos</span>
              <span className="hidden md:inline">Publique suas fotos e aumente suas vendas.</span>
            </h2>
            <p className="text-sm text-pretty text-white/85 md:text-base">
              Mais visibilidade, controle sobre suas fotos e uma taxa a partir de{" "}
              <strong className="font-semibold text-white">
                {comissaoPct.toLocaleString("pt-BR")}%
              </strong>{" "}
              sobre as vendas.
            </p>
          </div>
          <Link
            href="/cadastro?tipo=fotografo"
            className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-highlight font-semibold text-highlight-foreground transition hover:brightness-95 focus-visible:ring-3 focus-visible:ring-white/70 focus-visible:outline-none max-md:size-12 max-md:justify-center md:h-13 md:px-6"
          >
            <span className="sr-only md:not-sr-only">Quero ser fotógrafo</span>
            <ArrowRight
              aria-hidden="true"
              className="size-5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
