"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import {
  BarChart3,
  BookUser,
  Flag,
  Handshake,
  Home,
  Images,
  Mail,
  Menu,
  MessageCircle,
  Rocket,
  Stamp,
  Store,
  Tags,
  Trophy,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";

// Ícones por nome: o layout (componente do servidor) não pode passar componentes de ícone para
// um componente do navegador, então passa só o nome.
const ICONES = {
  inicio: Home,
  metas: Trophy,
  eventos: Images,
  descontos: Tags,
  colaboracoes: Handshake,
  loja: Store,
  financeiro: Wallet,
  desempenho: BarChart3,
  perfil: UserRound,
  saques: Wallet,
  denuncias: Flag,
  mensagens: Mail,
  usuarios: Users,
  contas: BookUser,
  suporte: MessageCircle,
  sugestoes: Rocket,
  marca: Stamp,
} as const;

export type ItemMenu = { href: string; rotulo: string; icone: keyof typeof ICONES };

/** A página atual é este item? O início só quando o endereço é exatamente ele. */
function ativo(caminho: string, href: string, raiz: string) {
  return href === raiz ? caminho === raiz : caminho === href || caminho.startsWith(`${href}/`);
}

type PropsMenu = {
  titulo: string;
  itens: ItemMenu[];
  /** Endereço do início do painel (ex.: "/painel"). */
  raiz: string;
};

/**
 * Menu dos painéis (fotógrafo e gestão). No celular, uma barra com a página atual e um botão
 * que abre a lista; no computador, a lista fica sempre à esquerda. A página atual é marcada.
 * O menu não decide quem entra: cada página confere a sessão.
 *
 * Ler o endereço (usePathname) em páginas com parâmetro, como /painel/eventos/[id], exige um
 * <Suspense>: enquanto ele não chega, o mesmo menu aparece sem a página atual marcada.
 */
export function MenuPainel(props: PropsMenu) {
  return (
    <Suspense fallback={<CorpoMenu {...props} caminho="" />}>
      <MenuNaPagina {...props} />
    </Suspense>
  );
}

function MenuNaPagina(props: PropsMenu) {
  return <CorpoMenu {...props} caminho={usePathname()} />;
}

function CorpoMenu({ titulo, itens, raiz, caminho }: PropsMenu & { caminho: string }) {
  // Guarda em qual página a lista foi aberta: ao trocar de página, ela fecha sozinha.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const atual = itens.find((i) => ativo(caminho, i.href, raiz));

  const lista = (
    <ul className="flex flex-col gap-1">
      {itens.map((item) => {
        const Icone = ICONES[item.icone];
        const eAtual = item === atual;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={eAtual ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 font-medium ${
                eAtual
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icone aria-hidden="true" className="size-4 shrink-0" />
              {item.rotulo}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Celular: barra fixa no topo do conteúdo, com a página atual. */}
      <nav aria-label={titulo} className="sticky top-0 z-30 -mx-4 border-b bg-background md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {titulo}
            </span>
            <span className="truncate font-semibold">{atual?.rotulo ?? titulo}</span>
          </span>
          <button
            type="button"
            onClick={() => setAbertoEm(aberto ? null : caminho)}
            aria-expanded={aberto}
            aria-controls="menu-painel-lista"
            className="flex h-11 items-center gap-2 rounded-lg border px-3 font-medium hover:bg-muted"
          >
            {aberto ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
            Menu
          </button>
        </div>
        {aberto && (
          <div id="menu-painel-lista" className="border-t px-4 py-3 shadow-sm">
            {lista}
          </div>
        )}
      </nav>

      {/* Computador: lista lateral sempre visível. */}
      <nav aria-label={titulo} className="hidden md:block">
        <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {titulo}
        </p>
        <div className="sticky top-4">{lista}</div>
      </nav>
    </>
  );
}
