import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";

import { LinkConta } from "./link-conta";
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
          <LinkConta href="/entrar" className={estiloLink}>
            <UserRound aria-hidden="true" className="size-5" />
            Entrar
          </LinkConta>
        </span>
        <MenuCelular
          logado={false}
          itens={[
            { href: "/", rotulo: "Início" },
            { href: "/eventos", rotulo: "Eventos" },
            { href: "/entrar", rotulo: "Entrar" },
            { href: "/cadastro", rotulo: "Criar conta" },
            { href: "/cadastro?tipo=fotografo", rotulo: "Quero vender minhas fotos" },
            { href: "/ajuda", rotulo: "Ajuda" },
          ]}
        />
      </div>
    );
  }

  const primeiroNome = usuario.nome.split(" ")[0];
  // O gestor também usa o painel de fotógrafo com a própria conta (podeUsarPainel).
  const areas = [
    ...(podeUsarPainel(usuario) ? [{ href: "/painel", rotulo: "Painel" }] : []),
    ...(usuario.papel === "admin" ? [{ href: "/admin", rotulo: "Gestão" }] : []),
  ];

  return (
    <div className="flex items-center gap-1">
      <div className="hidden items-center gap-1 sm:flex">
        {areas.map((area) => (
          <Link key={area.href} href={area.href} className={estiloLink}>
            {area.rotulo}
          </Link>
        ))}
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
          { href: "/", rotulo: "Início" },
          { href: "/eventos", rotulo: "Eventos" },
          ...areas,
          { href: "/minhas-compras", rotulo: "Minhas compras" },
          { href: "/conta/seguranca", rotulo: "Senha e segurança" },
          { href: "/ajuda", rotulo: "Ajuda" },
        ]}
      />
    </div>
  );
}
