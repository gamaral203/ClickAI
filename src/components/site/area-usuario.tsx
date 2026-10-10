import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import type { Usuario } from "@/dados/tipos";
import type { Navegacao } from "@/lib/navegacao";

import { LinkConta } from "./link-conta";
import { MenuCelular } from "./menu-celular";

const estiloLink =
  "inline-flex h-11 items-center gap-2 rounded-lg px-3 font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Entrar, ou o nome e o Sair, no cabeçalho do site de compra (visitante e cliente). No computador,
 * os links ficam no cabeçalho; no celular, dentro do menu (o cabeçalho só tem logo, carrinho e o
 * botão do menu). Os links vêm de `linksDoCabecalho`.
 */
export function AreaUsuario({
  usuario,
  navegacao,
}: {
  usuario: Pick<Usuario, "nome"> | null;
  navegacao: Navegacao;
}) {
  if (!usuario || !navegacao.perfil) {
    return (
      <div className="flex items-center gap-1">
        {/* No celular, "Entrar" fica dentro do menu. */}
        <span className="hidden sm:block">
          <LinkConta href="/entrar" className={estiloLink}>
            <UserRound aria-hidden="true" className="size-5" />
            Entrar
          </LinkConta>
        </span>
        <MenuCelular logado={false} itens={navegacao.celular} />
      </div>
    );
  }

  const primeiroNome = usuario.nome.split(" ")[0];
  return (
    <div className="flex items-center gap-1">
      <div className="hidden items-center gap-1 sm:flex">
        <Link href={navegacao.perfil.href} className={estiloLink}>
          <UserRound aria-hidden="true" className="size-5" />
          <span className="max-w-32 truncate">{primeiroNome}</span>
          <span className="sr-only">: {navegacao.perfil.rotulo.toLowerCase()}</span>
        </Link>
        <form action={sairAcao}>
          <button type="submit" className={estiloLink} aria-label="Sair">
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </form>
      </div>
      <MenuCelular logado nome={primeiroNome} itens={navegacao.celular} />
    </div>
  );
}
