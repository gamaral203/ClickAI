import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import { usuarioAtual } from "@/servicos/sessao";

import { MenuCelular } from "./menu-celular";

const estiloLink =
  "inline-flex h-11 items-center gap-2 rounded-lg px-3 font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Lê o cookie da sessão: usar sempre dentro de <Suspense>. No computador, os links ficam no
 * cabeçalho; no celular, dentro do menu (o cabeçalho só tem logo, carrinho e o botão do menu).
 */
export async function AreaUsuario() {
  const usuario = await usuarioAtual();

  if (!usuario) {
    return (
      <div className="flex items-center gap-1">
        {/* No celular, "Entrar" fica dentro do menu. */}
        <span className="hidden sm:block">
          <Link href="/entrar" className={estiloLink}>
            <UserRound aria-hidden="true" className="size-5" />
            Entrar
          </Link>
        </span>
        <MenuCelular
          logado={false}
          itens={[
            { href: "/eventos", rotulo: "Eventos" },
            { href: "/entrar", rotulo: "Entrar" },
            { href: "/cadastro", rotulo: "Criar conta" },
            { href: "/cadastro?tipo=fotografo", rotulo: "Quero vender minhas fotos" },
          ]}
        />
      </div>
    );
  }

  const primeiroNome = usuario.nome.split(" ")[0];
  const area =
    usuario.papel === "fotografo"
      ? { href: "/painel", rotulo: "Painel" }
      : usuario.papel === "admin"
        ? { href: "/admin", rotulo: "Gestão" }
        : null;

  return (
    <div className="flex items-center gap-1">
      <div className="hidden items-center gap-1 sm:flex">
        {area && (
          <Link href={area.href} className={estiloLink}>
            {area.rotulo}
          </Link>
        )}
        <Link href="/minhas-compras" className={estiloLink}>
          <UserRound aria-hidden="true" className="size-5" />
          <span className="max-w-32 truncate">{primeiroNome}</span>
          <span className="sr-only">: minhas compras</span>
        </Link>
        <form action={sairAcao}>
          <button type="submit" className={estiloLink} aria-label="Sair">
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </form>
      </div>
      <MenuCelular
        logado
        nome={primeiroNome}
        itens={[
          { href: "/eventos", rotulo: "Eventos" },
          ...(area ? [area] : []),
          { href: "/minhas-compras", rotulo: "Minhas compras" },
        ]}
      />
    </div>
  );
}
