import Image from "next/image";
import Link from "next/link";

import type { ItemNavegacao } from "@/lib/navegacao";

// Classes completas por faixa de tela: o Tailwind só gera as classes escritas por inteiro.
const FAIXAS = {
  /** Entre lg e xl: quem tem conta de fotógrafo (em xl, o cartão da meta toma o lugar). */
  lg: "lg:inline-flex xl:hidden",
  /** De lg em diante: quem não tem conta de fotógrafo, sem o cartão da meta. */
  "lg-e-xl": "lg:inline-flex",
} as const;

/** Avatar (ou foto de perfil) e primeiro nome levando ao perfil, no cabeçalho do painel. */
export function LinkDoPerfil({
  perfil,
  primeiroNome,
  avatar,
  faixa,
}: {
  perfil: ItemNavegacao;
  primeiroNome: string;
  /** Foto de perfil ou avatar (src/lib/avatares.ts). */
  avatar: string;
  faixa: keyof typeof FAIXAS;
}) {
  return (
    <Link
      href={perfil.href}
      className={`hidden h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${FAIXAS[faixa]}`}
    >
      <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-accent">
        <Image src={avatar} alt="" fill sizes="28px" className="object-cover" />
      </span>
      <span className="max-w-32 truncate">{primeiroNome}</span>
      <span className="sr-only">: {perfil.rotulo.toLowerCase()}</span>
    </Link>
  );
}
