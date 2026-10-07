import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioEntrar } from "@/components/conta/formularios";
import { caminhoSeguro } from "@/lib/redirecionamento";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <Formulario searchParams={searchParams} />
      </Suspense>
      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Ambiente de exemplo: entre com <strong>ana@exemplo.com</strong> (cliente) ou{" "}
        <strong>lia@exemplo.com</strong> (fotógrafa), senha <strong>clicouai123</strong>.
      </p>
    </div>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/entrar">, "searchParams">) {
  const { proximo } = await searchParams;
  const valor = Array.isArray(proximo) ? proximo[0] : proximo;
  return <FormularioEntrar proximo={valor ? caminhoSeguro(valor) : undefined} />;
}
