import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FormularioCodigoLogin } from "@/components/conta/formulario-codigo-login";
import { loginPendente } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Verificação em duas etapas",
  robots: { index: false, follow: false },
};

// Segunda etapa do login de quem ligou a verificação em duas etapas (src/servicos/sessao.ts):
// a senha (ou o Google) já confere; falta o código do app autenticador.
export default function PaginaCodigo() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Verificação em duas etapas</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const pendente = await loginPendente();
  if (!pendente) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          O tempo para digitar o código acabou ou o login não começou neste aparelho.
        </p>
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar de novo
        </Link>
      </div>
    );
  }
  return <FormularioCodigoLogin />;
}
