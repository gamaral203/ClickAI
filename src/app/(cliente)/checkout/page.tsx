import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioCheckout } from "@/components/carrinho/formulario-checkout";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default function PaginaCheckout() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Finalizar compra</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Formulario />
      </Suspense>
    </div>
  );
}

/** Para quem está logado, já preenche nome e e-mail; a compra fica em Minhas compras. */
async function Formulario() {
  const usuario = await usuarioAtual();
  return (
    <FormularioCheckout
      inicial={usuario ? { nome: usuario.nome, email: usuario.email } : undefined}
    />
  );
}
