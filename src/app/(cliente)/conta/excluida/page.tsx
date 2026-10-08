import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Conta excluída",
  robots: { index: false, follow: false },
};

export default function PaginaContaExcluida() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <CheckCircle2 aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Sua conta foi excluída</h1>
      <p className="text-muted-foreground">
        Apagamos os seus dados pessoais e encerramos a sessão em todos os aparelhos. O registro das
        vendas fica guardado sem o seu nome e e-mail, como a lei fiscal exige.
      </p>
      <Link href="/" className={buttonVariants({ size: "touch" })}>
        Ir para o início
      </Link>
    </div>
  );
}
