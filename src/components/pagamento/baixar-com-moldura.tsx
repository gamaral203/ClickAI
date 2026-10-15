import { Smartphone, Square } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { linkComMoldura, type FormatoMoldura } from "@/lib/moldura";

const ROTULO: Record<FormatoMoldura, string> = {
  story: "Baixar para story",
  feed: "Baixar para feed",
};
const ICONE = { story: Smartphone, feed: Square } as const;

/**
 * "Baixar para story" e "Baixar para feed" de uma foto comprada, quando o evento tem a moldura
 * daquele formato. A rota confere o pedido pago como no original (src/servicos/molduras.ts).
 */
export function BaixarComMoldura({
  itemId,
  formatos,
  token = null,
}: {
  itemId: string;
  formatos: FormatoMoldura[];
  /** Token do link do pedido (convidado); sem ele, vale a sessão do dono do pedido. */
  token?: string | null;
}) {
  if (formatos.length === 0) return null;
  return (
    <span className="flex flex-wrap justify-end gap-2">
      {formatos.map((formato) => {
        const Icone = ICONE[formato];
        return (
          // <a> e não <Link>: a rota devolve a imagem como anexo, não uma página.
          <a
            key={formato}
            download
            href={linkComMoldura(itemId, formato, token)}
            className={buttonVariants({ variant: "secondary", size: "touch" })}
          >
            <Icone aria-hidden="true" data-icon="inline-start" />
            {ROTULO[formato]}
          </a>
        );
      })}
    </span>
  );
}
