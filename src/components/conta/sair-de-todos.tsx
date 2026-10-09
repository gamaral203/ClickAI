import { LogOut } from "lucide-react";

import { sairDeTodosAcao } from "@/app/(cliente)/conta/acoes";
import { Button } from "@/components/ui/button";

/**
 * "Sair de todos os dispositivos": encerra no servidor todas as sessões da conta, inclusive a
 * deste aparelho (útil se a pessoa entrou num computador emprestado ou perdeu o celular).
 */
export function SairDeTodos() {
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Sessões</h2>
      <p className="text-sm text-muted-foreground">
        Entrou num aparelho que não é seu ou perdeu o celular? Saia de todos os aparelhos de uma
        vez; depois, entre de novo neste.
      </p>
      <form action={sairDeTodosAcao}>
        <Button type="submit" variant="outline" size="touch" className="w-fit">
          <LogOut aria-hidden="true" data-icon="inline-start" />
          Sair de todos os dispositivos
        </Button>
      </form>
    </section>
  );
}
