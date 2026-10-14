import Image from "next/image";
import Link from "next/link";
import { AtSign } from "lucide-react";
import { Suspense } from "react";

import { linksDoCabecalho } from "@/lib/navegacao";
import { usuarioAtual } from "@/servicos/sessao";

const grupos = [
  {
    titulo: "Para você",
    links: [
      { href: "/eventos", rotulo: "Eventos" },
      { href: "/como-funciona", rotulo: "Como funciona" },
      { href: "/recuperar-compras", rotulo: "Recuperar minhas compras" },
      { href: "/ajuda", rotulo: "Ajuda" },
    ],
  },
  {
    titulo: "Para fotógrafos",
    links: [
      { href: "/cadastro?tipo=fotografo", rotulo: "Venda suas fotos" },
      { href: "/entrar", rotulo: "Entrar no painel" },
    ],
  },
  {
    titulo: "Políticas",
    links: [
      { href: "/termos", rotulo: "Termos de uso" },
      { href: "/privacidade", rotulo: "Privacidade" },
      { href: "/politica-de-conteudo", rotulo: "Política de conteúdo" },
      { href: "/remover-foto", rotulo: "Remover uma foto" },
    ],
  },
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

/** Rodapé do site de compra: fundo azul profundo, logo claro e os links em três grupos. */
function RodapeCompleto() {
  return (
    <footer className="bg-profundo text-white print:hidden">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-12 pb-8 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-6">
        <div className="flex flex-col items-start gap-4">
          <Link
            href="/"
            className="flex h-11 items-center rounded-md focus-visible:ring-3 focus-visible:ring-white/60"
          >
            <Image
              src="/logo-clara.png"
              alt="ClicouAí — página inicial"
              width={544}
              height={160}
              className="h-8 w-auto"
            />
          </Link>
          <p className="max-w-xs text-sm text-white/75">
            As fotos do seu evento, a um clique. Fotógrafos publicam, você encontra as suas e baixa
            o original.
          </p>
          <a
            href="https://www.instagram.com/clicouai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md text-sm font-medium text-white/90 hover:text-white focus-visible:ring-3 focus-visible:ring-white/60"
          >
            <AtSign aria-hidden="true" className="size-4" />
            Instagram @clicouai
          </a>
        </div>
        {/* No celular, os grupos ficam lado a lado em duas colunas. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:contents">
          {grupos.map((grupo) => (
            <nav key={grupo.titulo} aria-label={grupo.titulo}>
              <h2 className="text-sm font-semibold text-white">{grupo.titulo}</h2>
              <ul className="mt-2 flex flex-col">
                {grupo.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm text-white/75 hover:text-white focus-visible:ring-3 focus-visible:ring-white/60 md:min-h-9"
                    >
                      {l.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-5 text-xs text-white/70 md:px-6">
          {/* Sem o ano: `new Date()` aqui impediria a página 404 de sair pronta do build. */}
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-highlight" />©
          ClicouAí · Pagamento por Pix ou cartão
        </p>
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
