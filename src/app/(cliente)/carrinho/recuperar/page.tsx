import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { RecuperarCarrinho } from "@/components/carrinho/recuperar-carrinho";
import { buttonVariants } from "@/components/ui/button";
import { buscarItensParaCompra, buscarPedido } from "@/dados";
import { pedidoDoLinkParaRecuperar } from "@/servicos/mensagens";

export const metadata: Metadata = {
  title: "Recuperar carrinho",
  // O link carrega um token: nunca indexar.
  robots: { index: false, follow: false },
};

export default function PaginaRecuperar({ searchParams }: PageProps<"/carrinho/recuperar">) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Recuperar carrinho</h1>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/carrinho/recuperar">["searchParams"];
}) {
  const { token } = await searchParams;
  const texto = Array.isArray(token) ? token[0] : token;
  const pedidoId = texto && texto.length <= 400 ? pedidoDoLinkParaRecuperar(texto) : null;
  const encontrado = pedidoId ? await buscarPedido(pedidoId) : null;
  // Só remonta o que continua à venda: itens excluídos ou de eventos fora do ar ficam de fora.
  const aVenda = encontrado
    ? await buscarItensParaCompra(encontrado.itens.map((i) => i.fotoId))
    : [];

  if (aVenda.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
        <p>
          {encontrado
            ? "As fotos deste pedido não estão mais à venda."
            : "Este link não vale mais. Encontre o evento e escolha as fotos de novo."}
        </p>
        <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
          Encontrar meu evento
        </Link>
      </div>
    );
  }
  return <RecuperarCarrinho ids={aVenda.map((i) => i.foto.id)} />;
}
