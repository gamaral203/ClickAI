"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { linkAtivo, type ItemNavegacao } from "@/lib/navegacao";

/**
 * Link do cabeçalho do site de compra (computador). A página atual fica em azul com um traço
 * limão embaixo; o limão é só detalhe (1,2:1 no branco), quem indica a página é a cor do texto
 * e o `aria-current`. Lê o endereço atual: por isso é componente do navegador.
 */
export function LinkDoCabecalho({ href, rotulo, exato }: ItemNavegacao) {
  const atual = linkAtivo(usePathname(), href, exato);
  return (
    <Link
      href={href}
      aria-current={atual ? "page" : undefined}
      className="relative inline-flex h-11 items-center rounded-lg px-3 font-medium text-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:scale-x-0 after:rounded-full after:bg-highlight after:transition-transform after:duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:text-primary aria-[current=page]:after:scale-x-100 motion-reduce:after:transition-none"
    >
      {rotulo}
    </Link>
  );
}
