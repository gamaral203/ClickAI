import { Suspense } from "react";
import { LogOut } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import type { Usuario } from "@/dados/tipos";
import type { Navegacao } from "@/lib/navegacao";

import { MenuCelular } from "./menu-celular";
import { MetaDoCabecalho } from "./meta-do-cabecalho";
import { AtalhosDoPainel, LogoDoPainel } from "./nav-painel";

/**
 * Cabeçalho de quem vende (fotógrafo e gestor), em todas as páginas: mais sóbrio que o do site de
 * compra. Faixa azul fina no topo, fundo branco, atalhos de trabalho (Início, Meus eventos,
 * Financeiro, Desempenho, Minha loja; o gestor também tem Gestão), o perfil e o Sair, tudo numa
 * linha só. Quem tem conta de fotógrafo (o gestor que também vende, inclusive), em tela larga,
 * vê o cartão da meta com a foto de perfil no lugar do nome. Sem carrinho nem vitrine: conta de fotógrafo não compra. Os itens vêm de
 * `linksDoCabecalho`; a mesma altura do cabeçalho do site, para a troca não deslocar a página.
 */
export function CabecalhoPainel({
  usuario,
  navegacao,
}: {
  usuario: Usuario;
  navegacao: Navegacao;
}) {
  const primeiroNome = usuario.nome.split(" ")[0];
  const perfil = navegacao.perfil;
  return (
    <header className="border-b bg-background print:hidden">
      <div aria-hidden="true" className="h-1 bg-primary" />
      <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <LogoDoPainel papel={usuario.papel} />
          {/* No computador, os atalhos já dizem onde a pessoa está: o rótulo dá lugar a eles. */}
          <span className="hidden border-l pl-3 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase sm:inline lg:hidden">
            {usuario.papel === "admin" ? "Painel e gestão" : "Painel do fotógrafo"}
          </span>
        </div>

        <nav aria-label="Atalhos do painel" className="hidden self-stretch lg:block">
          <AtalhosDoPainel itens={navegacao.desktop} />
        </nav>

        <div className="flex items-center gap-1">
          {/* Em tela larga, quem tem conta de fotógrafo (o gestor que também vende, inclusive) vê o
              cartão da meta com a foto ou o avatar no lugar do nome (entre lg e xl, o avatar e o
              nome); quem não tem, o avatar e o nome. Enquanto carrega, um bloco do mesmo tamanho,
              para os atalhos não pularem. */}
          <Suspense
            fallback={
              <>
                <div
                  aria-hidden="true"
                  className="hidden h-11 w-28 animate-pulse rounded-lg bg-muted lg:block xl:hidden"
                />
                <div
                  aria-hidden="true"
                  className="hidden h-11 w-64 animate-pulse rounded-xl bg-muted xl:block"
                />
              </>
            }
          >
            <MetaDoCabecalho usuario={usuario} perfil={perfil} />
          </Suspense>
          <form action={sairAcao} className="hidden lg:block">
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sair
            </button>
          </form>
          <MenuCelular
            esconderEm="lg:hidden"
            logado
            nome={primeiroNome}
            itens={navegacao.celular}
          />
        </div>
      </div>
    </header>
  );
}
