"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Código do pagamento no gateway: curto na tela, inteiro no `title` e num botão que copia o
 * código completo para a área de transferência.
 */
export function CodigoCopiavel({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      <span title={valor} className="min-w-0 truncate font-mono text-xs text-muted-foreground">
        {valor}
      </span>
      <button
        type="button"
        onClick={copiar}
        title={copiado ? "Copiado" : `Copiar o código ${valor}`}
        aria-label={copiado ? "Código copiado" : "Copiar o código do pagamento"}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {copiado ? (
          <Check aria-hidden="true" className="size-3.5 text-primary" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
      </button>
      <span role="status" className="sr-only">
        {copiado ? "Código copiado" : ""}
      </span>
    </span>
  );
}
