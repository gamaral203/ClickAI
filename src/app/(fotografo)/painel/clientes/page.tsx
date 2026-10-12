import type { Metadata } from "next";
import { Suspense } from "react";

import { ListaClientes } from "@/components/painel/lista-clientes";
import { listarClientesDoFotografo } from "@/dados";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Meus clientes",
  robots: { index: false, follow: false },
};

export default function PaginaClientes() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Meus clientes</h1>
        <p className="text-sm text-muted-foreground">
          Quem comprou as suas fotos, quando e quais levou. Toque no cliente para ver cada compra.
          As fotos aparecem sem marca d&apos;água, só para você.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/clientes");
  const clientes = await listarClientesDoFotografo(conta.id);
  return <ListaClientes clientes={clientes} />;
}
