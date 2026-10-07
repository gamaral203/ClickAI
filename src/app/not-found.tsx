import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { Cabecalho } from "@/components/site/cabecalho";
import { Rodape } from "@/components/site/rodape";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página não encontrada",
};

// Fica na raiz do app, fora dos layouts dos grupos, por isso traz o próprio cabeçalho.
export default function NaoEncontrado() {
  return (
    <>
      <Cabecalho />
      <main className="flex flex-1 items-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <SearchX aria-hidden="true" className="size-7" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>
          <p className="text-muted-foreground">
            O link pode estar incompleto, o evento pode ter saído do ar ou a foto pode ter sido
            removida pelo fotógrafo.
          </p>
          <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
            Ver os eventos
          </Link>
        </div>
      </main>
      <Rodape />
    </>
  );
}
