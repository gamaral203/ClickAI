import type { Metadata } from "next";

import { FormularioNovaSenha } from "@/components/conta/formularios-senha-esquecida";

export const metadata: Metadata = {
  title: "Criar nova senha",
  robots: { index: false, follow: false },
  // O token fica no # do endereço e nunca chega ao servidor; mesmo assim, nada de Referer.
  referrer: "no-referrer",
};

// Link do e-mail de "Esqueci a senha" (src/servicos/redefinicao-senha.ts). A página não lê nada
// do servidor: o token vem do # e vai no corpo do formulário.
export default function PaginaNovaSenha() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-10 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Criar nova senha</h1>
      <FormularioNovaSenha />
    </div>
  );
}
