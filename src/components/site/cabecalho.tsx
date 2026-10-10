import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LinkCarrinho } from "@/components/carrinho/link-carrinho";
import { linksDoCabecalho, type Navegacao } from "@/lib/navegacao";
import { usuarioAtual } from "@/servicos/sessao";
import type { Usuario } from "@/dados/tipos";

import { AreaUsuario } from "./area-usuario";
import { CabecalhoPainel } from "./cabecalho-painel";

/**
 * Cabeçalho do site. Quem decide a variante é `linksDoCabecalho` (src/lib/navegacao.ts): visitante
 * e cliente veem o site de compra; fotógrafo e gestor, o cabeçalho do painel. Como a escolha lê a
 * sessão, o cabeçalho inteiro sai dentro do <Suspense>; enquanto isso, só o logo e o espaço
 * reservado (mesma altura), para não piscar o menu de visitante para quem vende.
 */
export function Cabecalho() {
  return (
    <Suspense fallback={<CabecalhoReservado />}>
      <CabecalhoDoPapel />
    </Suspense>
  );
}

async function CabecalhoDoPapel() {
  const usuario = await usuarioAtual();
  const navegacao = linksDoCabecalho(usuario);
  if (navegacao.variante === "painel" && usuario) {
    return <CabecalhoPainel usuario={usuario} navegacao={navegacao} />;
  }
  return <CabecalhoPublico usuario={usuario} navegacao={navegacao} />;
}

function Logo() {
  return (
    <Image
      src="/logo.png"
      alt="ClicouAí — página inicial"
      width={544}
      height={160}
      loading="eager"
      className="h-8 w-auto sm:h-9"
    />
  );
}

/** Enquanto a sessão não chega: o logo (sem link, porque o destino depende do papel). */
function CabecalhoReservado() {
  return (
    <header className="border-b bg-background print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
        <Logo />
      </div>
    </header>
  );
}

function CabecalhoPublico({
  usuario,
  navegacao,
}: {
  usuario: Usuario | null;
  navegacao: Navegacao;
}) {
  return (
    <header className="border-b bg-background print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="flex h-11 shrink-0 items-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo />
        </Link>
        <nav aria-label="Principal">
          <ul className="flex items-center gap-1">
            {navegacao.desktop.map((link) => (
              <li key={link.href} className="hidden sm:block">
                <Link
                  href={link.href}
                  className="inline-flex h-11 items-center rounded-lg px-3 font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {link.rotulo}
                </Link>
              </li>
            ))}
            {navegacao.carrinho && (
              <li>
                <LinkCarrinho />
              </li>
            )}
            <li>
              <AreaUsuario usuario={usuario} navegacao={navegacao} />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
