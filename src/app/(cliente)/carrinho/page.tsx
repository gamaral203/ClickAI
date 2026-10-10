import type { Metadata } from "next";
import { Suspense } from "react";

import { AvisoContaDeFotografo } from "@/components/carrinho/aviso-conta-de-fotografo";
import { ConteudoCarrinho } from "@/components/carrinho/conteudo-carrinho";
import { podeComprar } from "@/lib/navegacao";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Carrinho",
  robots: { index: false, follow: false },
};

export default function PaginaCarrinho() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-4xl animate-pulse px-4 py-10" />}>
      <Carrinho />
    </Suspense>
  );
}

/** Conta de fotógrafo não compra: no lugar do carrinho, o aviso para sair da conta. */
async function Carrinho() {
  const usuario = await usuarioAtual();
  if (usuario && !podeComprar(usuario)) return <AvisoContaDeFotografo papel={usuario.papel} />;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Carrinho</h1>
      <ConteudoCarrinho />
    </div>
  );
}
