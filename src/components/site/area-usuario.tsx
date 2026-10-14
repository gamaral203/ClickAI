import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import type { Usuario } from "@/dados/tipos";
import type { Navegacao } from "@/lib/navegacao";

import { LinkConta } from "./link-conta";

const estiloLink =
  "inline-flex h-11 items-center gap-2 rounded-lg px-3 font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";
const estiloIcone =
  "inline-flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A conta no cabeçalho do site de compra (visitante e cliente). No celular, só o ícone da conta
 * (Entrar ou Minhas compras); o resto fica no menu, à esquerda. Do tablet em diante, "Entrar" com
 * o ícone, ou o nome e o Sair. Os links vêm de `linksDoCabecalho`.
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
      <>
        <span className="md:hidden">
          <LinkConta href="/entrar" className={estiloIcone} rotulo="Entrar">
            <UserRound aria-hidden="true" className="size-5" />
          </LinkConta>
        </span>
        <span className="hidden md:block">
          <LinkConta href="/entrar" className={estiloLink}>
            <UserRound aria-hidden="true" className="size-5" />
            Entrar
          </LinkConta>
        </span>
      </>
    );
  }

  const primeiroNome = usuario.nome.split(" ")[0];
  return (
    <>
      <Link
        href={navegacao.perfil.href}
        aria-label={navegacao.perfil.rotulo}
        className={`${estiloIcone} md:hidden`}
      >
        <UserRound aria-hidden="true" className="size-5" />
      </Link>
      <div className="hidden items-center gap-1 md:flex">
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
    </>
  );
}
