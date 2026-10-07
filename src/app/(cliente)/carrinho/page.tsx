import type { Metadata } from "next";

import { ConteudoCarrinho } from "@/components/carrinho/conteudo-carrinho";

export const metadata: Metadata = {
  title: "Carrinho",
  robots: { index: false, follow: false },
};

export default function PaginaCarrinho() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Carrinho</h1>
      <ConteudoCarrinho />
    </div>
  );
}
