import type { Metadata } from "next";
import { Suspense } from "react";

import { FormularioDemonstracao } from "@/components/admin/formulario-demonstracao";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Conta de demonstração",
  robots: { index: false, follow: false },
};

export default function PaginaDemonstracao() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Conta de demonstração</h1>
        <p className="text-muted-foreground">
          Cria um fotógrafo com eventos, fotos, clientes e cerca de R$ 12 mil em vendas fictícias,
          para gravar vídeos e tutoriais.
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-1 rounded-xl border bg-card p-4 pl-8 text-sm text-muted-foreground sm:p-5 sm:pl-9">
        <li>Os eventos ficam não listados: fora da página inicial, das listagens e da busca.</li>
        <li>O saldo não pode ser sacado.</li>
        <li>As vendas ficam fora dos rankings e dos números da gestão.</li>
        <li>Os clientes usam e-mails @example.com: ninguém recebe nada.</li>
      </ul>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirGestor("/admin/demonstracao");
  return <FormularioDemonstracao />;
}
