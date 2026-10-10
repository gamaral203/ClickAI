"use client";

import { Moon, Sun } from "lucide-react";

import { COOKIE_TEMA } from "@/lib/tema";

/**
 * Alterna entre o modo dia (padrão) e o noturno. A escolha vai num cookie, que o layout lê no
 * servidor para já mandar a página na cor certa (sem piscar), e na classe `dark` do <html>, que
 * o Tailwind usa (src/app/globals.css). O ícone certo é escolhido por CSS (`dark:`), então o
 * botão não precisa saber o tema e renderiza igual no servidor e no navegador.
 */
export function BotaoTema({ className = "" }: { className?: string }) {
  function alternar() {
    const escuro = document.documentElement.classList.toggle("dark");
    document.cookie = `${COOKIE_TEMA}=${escuro ? "escuro" : "claro"}; path=/; max-age=31536000; SameSite=Lax`;
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
