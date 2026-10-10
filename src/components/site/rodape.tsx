import Link from "next/link";
import { Suspense } from "react";

import { linksDoCabecalho } from "@/lib/navegacao";
import { usuarioAtual } from "@/servicos/sessao";

const links = [
  { href: "/como-funciona", rotulo: "Como funciona" },
  { href: "/eventos", rotulo: "Eventos" },
  { href: "/cadastro?tipo=fotografo", rotulo: "Venda suas fotos" },
  { href: "/ajuda", rotulo: "Ajuda" },
  { href: "/termos", rotulo: "Termos de uso" },
  { href: "/privacidade", rotulo: "Privacidade" },
  { href: "/politica-de-conteudo", rotulo: "Política de conteúdo" },
  { href: "/remover-foto", rotulo: "Remover uma foto" },
];

const linksCurtos = [
  { href: "/ajuda", rotulo: "Ajuda" },
  { href: "/termos", rotulo: "Termos" },
  { href: "/privacidade", rotulo: "Privacidade" },
];

/**
 * Rodapé do site. Quem vende (cabeçalho do painel) vê o rodapé curto; visitante e cliente, o
 * completo. A mesma `linksDoCabecalho` decide; como lê a sessão, sai dentro do <Suspense>.
 */
export function Rodape() {
  return (
    <Suspense fallback={null}>
      <RodapeDoPapel />
    </Suspense>
  );
}

async function RodapeDoPapel() {
  const { rodape } = linksDoCabecalho(await usuarioAtual());
  return rodape === "curto" ? <RodapeCurto /> : <RodapeCompleto />;
}

function RodapeCompleto() {
  return (
    <footer className="border-t print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-highlight" />©
          ClicouAí · Instagram @clicouai
        </span>
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap gap-x-4 sm:gap-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex h-10 min-w-10 items-center hover:text-foreground sm:h-8 sm:min-w-0"
                >
                  {l.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

function RodapeCurto() {
  return (
    <footer className="border-t print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 text-sm text-muted-foreground">
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-1">
            {linksCurtos.map((l, i) => (
              <li key={l.href} className="flex items-center gap-x-1">
                {i > 0 && <span aria-hidden="true">·</span>}
                <Link
                  href={l.href}
                  className="inline-flex h-10 items-center px-1 hover:text-foreground sm:h-8"
                >
                  {l.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-highlight" />
          ClicouAí © {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
