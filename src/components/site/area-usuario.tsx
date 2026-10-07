import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import { usuarioAtual } from "@/servicos/sessao";

const estiloLink =
  "inline-flex h-11 items-center gap-2 rounded-lg px-3 font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** Lê o cookie da sessão: usar sempre dentro de <Suspense>. */
export async function AreaUsuario() {
  const usuario = await usuarioAtual();

  if (!usuario) {
    return (
      <Link href="/entrar" className={estiloLink}>
        <UserRound aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">Entrar</span>
        <span className="sr-only sm:hidden">Entrar</span>
      </Link>
    );
  }

  const primeiroNome = usuario.nome.split(" ")[0];
  return (
    <div className="flex items-center gap-1">
      {usuario.papel === "fotografo" && (
        <Link href="/painel" className={estiloLink}>
          Painel
        </Link>
      )}
      {(usuario.papel === "admin" || usuario.papel === "atendente") && (
        <Link href="/admin" className={estiloLink}>
          Gestão
        </Link>
      )}
      <Link href="/minhas-compras" className={estiloLink}>
        <UserRound aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">{primeiroNome}</span>
        <span className="sr-only sm:hidden">Minhas compras de {primeiroNome}</span>
      </Link>
      <form action={sairAcao}>
        <button type="submit" className={estiloLink} aria-label="Sair">
          <LogOut aria-hidden="true" className="size-5" />
        </button>
      </form>
    </div>
  );
}
