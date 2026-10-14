import type { Metadata } from "next";

import { FormularioEsqueciSenha } from "@/components/conta/formularios-senha-esquecida";

export const metadata: Metadata = { title: "Esqueci a senha", robots: { index: false } };

export default function PaginaEsqueciSenha() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-10 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Esqueci a senha</h1>
      <FormularioEsqueciSenha />
    </div>
  );
}
