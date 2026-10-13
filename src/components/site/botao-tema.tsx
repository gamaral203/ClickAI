"use client";

import { Moon, Sun } from "lucide-react";

import { COOKIE_TEMA } from "@/lib/tema";

/**
 * Alterna entre o modo dia (padrão) e o noturno. A escolha vai num cookie, que o layout lê no
 * servidor para já mandar a página na cor certa (sem piscar), e na classe `dark` do <html>, que
 * o Tailwind usa (src/app/globals.css). O ícone certo é escolhido por CSS (`dark:`), então o
 * botão não precisa saber o tema e renderiza igual no servidor e no navegador.
 */
export function BotaoTema({
  className = "",
  comoItem = false,
}: {
  className?: string;
  /** Como linha de menu (no menu do celular), com o nome escrito. */
  comoItem?: boolean;
}) {
  function alternar() {
    const escuro = document.documentElement.classList.toggle("dark");
    document.cookie = `${COOKIE_TEMA}=${escuro ? "escuro" : "claro"}; path=/; max-age=31536000; SameSite=Lax`;
  }

  if (comoItem) {
    return (
      <button
        type="button"
        onClick={alternar}
        className="flex h-11 w-full items-center gap-2 rounded-lg px-3 font-medium hover:bg-accent hover:text-accent-foreground"
      >
        <Moon aria-hidden="true" className="size-4 dark:hidden" />
        <Sun aria-hidden="true" className="hidden size-4 dark:block" />
        <span className="dark:hidden">Modo noturno</span>
        <span className="hidden dark:inline">Modo dia</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className={`inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${className}`}
    >
      <Moon aria-hidden="true" className="size-5 dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-5 dark:block" />
      <span className="sr-only dark:hidden">Ativar o modo noturno</span>
      <span className="sr-only hidden dark:inline">Ativar o modo dia</span>
    </button>
  );
}
