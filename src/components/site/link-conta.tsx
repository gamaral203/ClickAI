"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { comRetorno } from "@/lib/redirecionamento";

/** Link de entrar/criar conta que, no link de um fotógrafo, volta para a biblioteca dele. */
export function LinkConta({
  href,
  className,
  children,
}: {
  href: "/entrar" | "/cadastro";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={comRetorno(href, usePathname())} className={className}>
      {children}
    </Link>
  );
}
