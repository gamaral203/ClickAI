import type { Metadata } from "next";
import { Suspense } from "react";

import { AvisoContaDeFotografo } from "@/components/carrinho/aviso-conta-de-fotografo";
import { FormularioCheckout } from "@/components/carrinho/formulario-checkout";
import { exigeCpfDoComprador } from "@/lib/gateway";
import { podeComprar } from "@/lib/navegacao";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default function PaginaCheckout() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
          <h1 className="text-3xl font-bold tracking-tight">Finalizar compra</h1>
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
      }
    >
      <Checkout />
    </Suspense>
  );
}

/**
 * Para quem está logado, já preenche nome e e-mail; a compra fica em Minhas compras. Conta de
 * fotógrafo não compra: no lugar do formulário, o aviso para sair da conta (a ação do checkout
 * recusa do mesmo jeito).
 */
async function Checkout() {
  const usuario = await usuarioAtual();
  if (usuario && !podeComprar(usuario)) return <AvisoContaDeFotografo papel={usuario.papel} />;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Finalizar compra</h1>
      <FormularioCheckout
        inicial={usuario ? { nome: usuario.nome, email: usuario.email } : undefined}
        pedirCpf={exigeCpfDoComprador()}
      />
    </div>
  );
}
