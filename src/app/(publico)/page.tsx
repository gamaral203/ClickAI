import Link from "next/link";
import { ArrowRight, CreditCard, Images, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const passos = [
  {
    icone: Search,
    titulo: "Encontre o seu evento",
    texto: "Busque pela corrida, festa ou formatura em que você estava.",
  },
  {
    icone: Images,
    titulo: "Escolha as suas fotos",
    texto: "Veja as prévias e separe as fotos em que você aparece.",
  },
  {
    icone: CreditCard,
    titulo: "Pague e baixe",
    texto: "Pague com Pix ou cartão e baixe os originais em alta resolução.",
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:py-24">
        <span className="rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-highlight-foreground">
          Em construção
        </span>
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          As fotos do seu evento, <span className="text-primary">a um clique.</span>
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Fotógrafos publicam as fotos de corridas, festas, formaturas e esportes. Você encontra as
          suas, paga e baixa o original.
        </p>
        <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
          Encontrar meu evento
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      </section>

      <section aria-labelledby="como-funciona" className="border-t bg-muted/50">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="como-funciona" className="text-2xl font-bold tracking-tight">
            Como funciona
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {passos.map(({ icone: Icone, titulo, texto }, i) => (
              <li key={titulo} className="flex flex-col gap-3 rounded-xl border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icone aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">Passo {i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold">{titulo}</h3>
                <p className="text-muted-foreground">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
