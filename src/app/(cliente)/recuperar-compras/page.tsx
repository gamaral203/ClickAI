import type { Metadata } from "next";
import Link from "next/link";

import { FormularioRecuperar } from "@/components/carrinho/formulario-recuperar";

export const metadata: Metadata = {
  title: "Recuperar minhas compras",
  description: "Comprou sem conta e perdeu o link? Receba de novo o acesso às suas fotos.",
};

export default function PaginaRecuperarCompras() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Recuperar minhas compras</h1>
        <p className="text-muted-foreground">
          Fechou a página ou perdeu o e-mail? Digite o e-mail que você usou na compra: mandamos para
          ele o link com todas as suas fotos compradas, para baixar de novo.
        </p>
      </div>
      <FormularioRecuperar />
      <p className="text-sm text-muted-foreground">
        Tem conta no ClicouAí? As compras com o mesmo e-mail também ficam em{" "}
        <Link
          href="/minhas-compras"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Minhas compras
        </Link>
        .
      </p>
    </div>
  );
}
