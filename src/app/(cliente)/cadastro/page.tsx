import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioCadastro } from "@/components/conta/formularios";

export const metadata: Metadata = { title: "Criar conta" };

export default function PaginaCadastro({ searchParams }: PageProps<"/cadastro">) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Formulario searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/cadastro">, "searchParams">) {
  const { tipo } = await searchParams;
  return <FormularioCadastro papelInicial={tipo === "fotografo" ? "fotografo" : "cliente"} />;
}
