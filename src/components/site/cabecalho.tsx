import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LinkCarrinho } from "@/components/carrinho/link-carrinho";
import { linksDoCabecalho, type Navegacao } from "@/lib/navegacao";
import { usuarioAtual } from "@/servicos/sessao";
import type { Usuario } from "@/dados/tipos";

import { AreaUsuario } from "./area-usuario";
import { CabecalhoPainel } from "./cabecalho-painel";
import { LinkDoCabecalho } from "./link-do-cabecalho";
import { MenuCelular } from "./menu-celular";

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
      className="h-8 w-auto md:h-9"
    />
  );
}

/** Enquanto a sessão não chega: o logo (sem link, porque o destino depende do papel). */
function CabecalhoReservado() {
  return (
    <header className="border-b bg-background print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-center px-4 md:h-18 md:justify-start md:px-6">
        <Logo />
      </div>
    </header>
  );
}

/**
 * Cabeçalho do site de compra. No celular (até 767 px): o menu à esquerda, o logo no centro e, à
 * direita, o carrinho e a conta. Do tablet em diante: o logo à esquerda e, à direita, os links,
 * o carrinho e o Entrar (ou o nome e o Sair).
 */
function CabecalhoPublico({
  usuario,
  navegacao,
}: {
  usuario: Usuario | null;
  navegacao: Navegacao;
}) {
  return (
    <header className="border-b bg-background print:hidden">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 md:flex md:h-18 md:justify-between md:gap-6 md:px-6">
        <div className="md:hidden">
          <MenuCelular
            lado="esquerda"
            esconderEm="md:hidden"
            logado={Boolean(usuario)}
            nome={usuario?.nome.split(" ")[0]}
            itens={navegacao.celular}
          />
        </div>
        <Link
          href="/"
          className="flex h-11 shrink-0 items-center justify-self-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo />
        </Link>
        <nav aria-label="Principal" className="justify-self-end">
          <ul className="flex items-center gap-0.5 md:gap-1">
            {navegacao.desktop.map((link) => (
              <li key={link.href} className="hidden md:block">
                <LinkDoCabecalho {...link} />
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
