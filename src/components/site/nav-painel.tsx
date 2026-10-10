"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Papel } from "@/dados/tipos";
import { destinoDoLogo, linkAtivo, type ItemNavegacao } from "@/lib/navegacao";

/**
 * Logo do cabeçalho do painel. Leva ao início do painel; o gestor, dentro da gestão (/admin/*),
 * volta para a visão geral da gestão. Lê o endereço atual: por isso é componente do navegador.
 */
export function LogoDoPainel({ papel }: { papel: Papel }) {
  const href = destinoDoLogo(papel, usePathname());
  return (
    <Link
      href={href}
      className="flex h-11 shrink-0 items-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Image
        src="/logo.png"
        alt={href === "/admin" ? "ClicouAí — gestão" : "ClicouAí — início do painel"}
        width={544}
        height={160}
        loading="eager"
        className="h-8 w-auto"
      />
    </Link>
  );
}

/**
 * Atalhos do painel no computador, com a página atual marcada (cor e traço embaixo, alinhado à
 * linha do cabeçalho). No celular, os mesmos itens ficam no menu.
 */
export function AtalhosDoPainel({ itens }: { itens: ItemNavegacao[] }) {
  const caminho = usePathname();
  return (
    <ul className="flex h-full items-stretch gap-1">
      {itens.map((item) => (
        <li key={item.href} className="flex">
          <Link
            href={item.href}
            aria-current={linkAtivo(caminho, item.href, item.exato) ? "page" : undefined}
            className="inline-flex items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            {item.rotulo}
          </Link>
        </li>
      ))}
    </ul>
  );
}
