import Image from "next/image";
import Link from "next/link";

import { LinkCarrinho } from "@/components/carrinho/link-carrinho";

const links = [{ href: "/eventos", rotulo: "Eventos" }];

export function Cabecalho() {
  return (
    <header className="border-b bg-background">
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
              <li key={link.href}>
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
          </ul>
        </nav>
      </div>
    </header>
  );
}
