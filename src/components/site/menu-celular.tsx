"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";

import { sairAcao } from "@/app/(cliente)/conta/acoes";

/**
 * Menu do cabeçalho no celular: um botão que abre a lista de links (Eventos, painel, compras,
 * entrar/sair). Fecha ao trocar de página, ao tocar fora ou com Esc.
 */
export function MenuCelular({
  itens,
  logado,
  nome,
}: {
  itens: { href: string; rotulo: string }[];
  logado: boolean;
  nome?: string;
}) {
  const caminho = usePathname();
  // Guarda em qual página o menu foi aberto: ao trocar de página, ele fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAbertoEm(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbertoEm(null);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative sm:hidden">
      <button
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
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          {nome && <p className="truncate px-3 py-2 text-sm text-muted-foreground">Olá, {nome}</p>}
          <ul className="flex flex-col">
            {itens.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={caminho === item.href ? "page" : undefined}
                  className="flex h-11 items-center rounded-lg px-3 font-medium hover:bg-accent hover:text-accent-foreground aria-[current=page]:text-primary"
                >
                  {item.rotulo}
                </Link>
              </li>
            ))}
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
