"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { comRetorno } from "@/lib/redirecionamento";

/** Link de entrar/criar conta que, no link de um fotógrafo, volta para a biblioteca dele. */
export function LinkConta({
  href,
  className,
  rotulo,
  children,
}: {
  href: "/entrar" | "/cadastro";
  className?: string;
  /** Nome acessível, quando o link é só um ícone. */
  rotulo?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={comRetorno(href, usePathname())} className={className} aria-label={rotulo}>
      {children}
    </Link>
  );
}
