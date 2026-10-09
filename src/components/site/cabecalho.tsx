import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LinkCarrinho } from "@/components/carrinho/link-carrinho";

import { AreaUsuario } from "./area-usuario";
import { MetaDoCabecalho } from "./meta-do-cabecalho";

const links = [
  { href: "/", rotulo: "Início" },
  { href: "/eventos", rotulo: "Eventos" },
];

export function Cabecalho() {
  return (
    <header className="border-b bg-background print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50">
          <Image
            src="/logo.png"
            alt="ClicouAí — página inicial"
            width={544}
            height={160}
            loading="eager"
            className="h-8 w-auto sm:h-9"
          />
        </Link>
        <nav aria-label="Principal">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href} className="hidden sm:block">
                <Link
                  href={link.href}
                  className="inline-flex h-11 items-center rounded-lg px-3 font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {link.rotulo}
                </Link>
              </li>
            ))}
            <li>
              <LinkCarrinho />
            </li>
            <li>
              {/* A área do usuário lê o cookie; o resto do cabeçalho sai pronto do build. */}
              <Suspense fallback={<div className="h-11 w-24" aria-hidden="true" />}>
                <AreaUsuario />
              </Suspense>
            </li>
          </ul>
        </nav>
      </div>
      {/* Meta de vendas do fotógrafo, logo abaixo do perfil (só no computador). */}
      <Suspense fallback={null}>
        <MetaDoCabecalho />
      </Suspense>
    </header>
  );
}
