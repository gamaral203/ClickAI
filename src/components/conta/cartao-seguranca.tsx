import Link from "next/link";
import { ChevronRight, KeyRound } from "lucide-react";

/**
 * Atalho para Senha e segurança (/conta/seguranca): troca de senha e "Sair de todos os
 * dispositivos". Fica em Minhas compras e em Perfil e recebimento.
 */
export function CartaoSeguranca() {
  return (
    <Link
      href="/conta/seguranca"
      className="flex min-h-11 items-center gap-3 rounded-xl border p-5 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <KeyRound aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <span className="flex flex-1 flex-col">
        <span className="text-lg font-semibold">Senha e segurança</span>
        <span className="text-sm text-muted-foreground">
          Trocar a senha e sair de todos os dispositivos.
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
