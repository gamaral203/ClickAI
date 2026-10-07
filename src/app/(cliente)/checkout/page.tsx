import type { Metadata } from "next";

import { FormularioCheckout } from "@/components/carrinho/formulario-checkout";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default function PaginaCheckout() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Finalizar compra</h1>
      <FormularioCheckout />
    </div>
  );
}
