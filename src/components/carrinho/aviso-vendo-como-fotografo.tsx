import { Info } from "lucide-react";

/**
 * No lugar dos botões de compra (foto, "comprar todas", pacote), para quem vende: ele vê a página
 * como o cliente vê, mas a conta de fotógrafo não compra. Sem estado nem dados: serve para
 * componentes do servidor e do navegador.
 */
export function AvisoVendoComoFotografo() {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-lg border bg-muted/60 p-3 text-sm text-muted-foreground"
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Você está vendo como fotógrafo; para comprar, saia da conta.
    </p>
  );
}
