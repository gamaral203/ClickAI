"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";
import { linkAtivo } from "@/lib/navegacao";
import { comRetorno } from "@/lib/redirecionamento";

/**
 * Menu do cabeçalho no celular: um botão que abre a lista de links (os do site de compra ou os do
 * painel, conforme `linksDoCabecalho`) e o Sair. Fecha ao trocar de página, ao tocar num link, ao
 * tocar fora ou com Esc; enquanto está aberto, a página de trás não rola.
 */
export function MenuCelular({
  itens,
  logado,
  nome,
  esconderEm = "sm:hidden",
  lado = "direita",
  extras,
}: {
  itens: { href: string; rotulo: string; exato?: boolean; selo?: string }[];
  logado: boolean;
  nome?: string;
  /** A partir de qual tela o menu some (os links passam para o cabeçalho). */
  esconderEm?: "sm:hidden" | "md:hidden" | "lg:hidden";
  /** De que lado do cabeçalho fica o botão (a lista abre alinhada a ele). */
  lado?: "esquerda" | "direita";
  /** Botões extras no fim da lista (ex.: modo noturno, sugestão), antes do Sair. */
  extras?: React.ReactNode;
}) {
  const caminho = usePathname();
  // Guarda em qual página o menu foi aberto: ao trocar de página, ele fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAbertoEm(null);
    };
    // Com Esc, o foco volta para o botão (a lista some e o foco não fica perdido na página).
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbertoEm(null);
      botao.current?.focus();
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    // Com o menu aberto, a página de trás não rola (no celular, o dedo rolaria o fundo).
    const raiz = document.documentElement;
    const rolagemAntes = raiz.style.overflow;
    raiz.style.overflow = "hidden";
    // O foco vai para o primeiro link, para quem navega pelo teclado ou leitor de tela.
    caixa.current?.querySelector<HTMLElement>("#menu-celular a, #menu-celular button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
      raiz.style.overflow = rolagemAntes;
    };
  }, [aberto]);

  return (
    <div ref={caixa} className={`relative ${esconderEm}`}>
      <button
        ref={botao}
        type="button"
        onClick={() => setAbertoEm(aberto ? null : caminho)}
        aria-expanded={aberto}
        aria-controls="menu-celular"
        aria-label={aberto ? "Fechar o menu" : "Abrir o menu"}
        className="inline-flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {aberto ? (
          <X aria-hidden="true" className="size-6" />
        ) : (
          <Menu aria-hidden="true" className="size-6" />
        )}
      </button>
      {aberto && (
        <div
          id="menu-celular"
          className={`absolute top-full ${lado === "esquerda" ? "left-0" : "right-0"} z-50 mt-2 max-h-[min(85dvh,calc(100dvh-5rem))] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg`}
        >
          {nome && <p className="truncate px-3 py-2 text-sm text-muted-foreground">Olá, {nome}</p>}
          <ul className="flex flex-col">
            {itens.map((item) => (
              <li key={item.href}>
                <Link
                  href={
                    item.href === "/entrar" || item.href === "/cadastro"
                      ? comRetorno(item.href, caminho)
                      : item.href
                  }
                  aria-current={linkAtivo(caminho, item.href, item.exato) ? "page" : undefined}
                  // O link para a própria página não troca o caminho: fecha o menu no toque.
                  onClick={() => setAbertoEm(null)}
                  className="flex h-11 items-center gap-2 rounded-lg px-3 font-medium hover:bg-accent hover:text-accent-foreground aria-[current=page]:text-primary aria-[current=page]:before:size-2 aria-[current=page]:before:shrink-0 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-highlight"
                >
                  {item.rotulo}
                  {item.selo && (
                    <span className="ml-auto rounded-full bg-highlight/25 px-2 py-0.5 text-xs font-semibold text-foreground">
                      {item.selo}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {extras && <li className="mt-1 flex flex-col border-t pt-1">{extras}</li>}
            {logado && (
              <li className="mt-1 border-t pt-1">
                <form action={sairAcao}>
                  <button
                    type="submit"
                    className="flex h-11 w-full items-center gap-2 rounded-lg px-3 font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                    Sair
                  </button>
                </form>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
