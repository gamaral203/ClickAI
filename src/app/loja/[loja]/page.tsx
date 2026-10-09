import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PaginaDaLoja } from "@/components/loja/pagina-loja";
import { buscarLojaPublica } from "@/dados";

// Loja pelo subdomínio: abre em /loja/<subdomínio> e, pelo proxy.ts, na raiz do subdomínio
// (liaramos.clicouai.com).

const FORMATO_LOJA = /^[a-z0-9-]{3,32}$/;

async function carregar(params: PageProps<"/loja/[loja]">["params"]) {
  const { loja } = await params;
  return FORMATO_LOJA.test(loja) ? buscarLojaPublica(loja) : null;
}

export async function generateMetadata({ params }: PageProps<"/loja/[loja]">): Promise<Metadata> {
  const loja = await carregar(params);
  if (!loja) return { title: "Loja não encontrada" };
  return {
    title: { absolute: loja.nome },
    description: loja.descricao ?? `Fotos dos eventos de ${loja.fotografo.nomePublico}.`,
  };
}

export default function PaginaLoja({ params }: PageProps<"/loja/[loja]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: Pick<PageProps<"/loja/[loja]">, "params">) {
  const loja = await carregar(params);
  if (!loja) notFound();
  return <PaginaDaLoja loja={loja} />;
}
