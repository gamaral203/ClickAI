import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PaginaDaLoja } from "@/components/loja/pagina-loja";
import { buscarLojaPublicaPorDominio } from "@/dados";
import { normalizarDominio } from "@/lib/loja";

// Loja no domínio próprio do fotógrafo (fotos.liaramos.com.br): o proxy.ts reescreve a raiz
// do domínio para cá. Só abre com o domínio verificado na Vercel.

async function carregar(params: PageProps<"/loja/dominio/[host]">["params"]) {
  const { host } = await params;
  const dominio = normalizarDominio(decodeURIComponent(host));
  return dominio.length <= 253 ? buscarLojaPublicaPorDominio(dominio) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/loja/dominio/[host]">): Promise<Metadata> {
  const loja = await carregar(params);
  if (!loja) return { title: "Loja não encontrada" };
  return {
    title: { absolute: loja.nome },
    description: loja.descricao ?? `Fotos dos eventos de ${loja.fotografo.nomePublico}.`,
  };
}

export default function PaginaLojaDominio({ params }: PageProps<"/loja/dominio/[host]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: Pick<PageProps<"/loja/dominio/[host]">, "params">) {
  const loja = await carregar(params);
  if (!loja) notFound();
  return <PaginaDaLoja loja={loja} />;
}
