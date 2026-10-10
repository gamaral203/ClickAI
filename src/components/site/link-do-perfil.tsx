import Link from "next/link";

import type { ItemNavegacao } from "@/lib/navegacao";

// Classes completas por faixa de tela: o Tailwind só gera as classes escritas por inteiro.
const FAIXAS = {
  /** Entre lg e xl (em xl, o cartão da meta ou o próprio link pelo MetaDoCabecalho). */
  lg: "lg:inline-flex xl:hidden",
  /** Só a partir de xl: quem não tem conta de fotógrafo, no lugar do cartão da meta. */
  xl: "xl:inline-flex",
} as const;

/** Inicial e primeiro nome levando ao perfil, no cabeçalho do painel. */
export function LinkDoPerfil({
  perfil,
  primeiroNome,
  faixa,
}: {
  perfil: ItemNavegacao;
  primeiroNome: string;
  faixa: keyof typeof FAIXAS;
}) {
  return (
    <Link
      href={perfil.href}
      className={`hidden h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${FAIXAS[faixa]}`}
    >
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground uppercase"
      >
        {primeiroNome.charAt(0)}
      </span>
      <span className="max-w-32 truncate">{primeiroNome}</span>
      <span className="sr-only">: {perfil.rotulo.toLowerCase()}</span>
    </Link>
  );
}
