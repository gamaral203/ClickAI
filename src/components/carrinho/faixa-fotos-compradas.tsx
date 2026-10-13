"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Camera, ChevronDown, X } from "lucide-react";

import {
  dispensarFaixa,
  esquecerPedidos,
  faixaDispensada,
  pedidosNoAparelho,
  type PedidoNoAparelho,
} from "@/lib/pedidos-no-aparelho";

/**
 * Faixa no topo do site para quem comprou neste navegador: "Você tem fotos compradas, baixe aqui".
 * Cobre quem pagou, fechou a página e não abriu o e-mail. Lê só o navegador (src/lib/
 * pedidos-no-aparelho.ts); some na página do pedido e na de recuperar compras. Fechar esconde por 3
 * dias; "Esquecer neste aparelho" apaga a lembrança (para computador compartilhado).
 */
export function FaixaFotosCompradas() {
  return (
    <Suspense fallback={null}>
      <Faixa />
    </Suspense>
  );
}

function Faixa() {
  const caminho = usePathname();
  const [pedidos, setPedidos] = useState<PedidoNoAparelho[]>([]);

  useEffect(() => {
    // Lido depois de montar: o servidor não conhece o navegador (sem piscar na primeira pintura).
    const leitura = setTimeout(() => setPedidos(faixaDispensada() ? [] : pedidosNoAparelho()), 0);
    return () => clearTimeout(leitura);
  }, [caminho]);

  if (pedidos.length === 0 || /^\/(pedidos|recuperar-compras)\b/.test(caminho)) return null;
  const [ultimo, ...outros] = pedidos;

  return (
    <div className="border-b border-primary/20 bg-accent text-accent-foreground print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <Camera aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="font-medium">Você tem fotos compradas.</span>
        <a
          href={ultimo.link}
          title={ultimo.eventos.join(", ") || undefined}
          className="font-bold text-primary underline-offset-4 hover:underline"
        >
          Baixar minhas fotos
        </a>
        {outros.length > 0 && (
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
              e mais {outros.length}
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </summary>
            <ul className="absolute top-full left-0 z-40 mt-1 flex w-64 flex-col rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
              {outros.map((p) => (
                <li key={p.id}>
                  <a href={p.link} className="block truncate rounded-lg px-2.5 py-2 hover:bg-muted">
                    {p.eventos.join(", ") || "Fotos"} · {p.fotos} {p.fotos === 1 ? "foto" : "fotos"}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              esquecerPedidos();
              setPedidos([]);
            }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background/60"
          >
            Esquecer neste aparelho
          </button>
          <button
            type="button"
            aria-label="Fechar o aviso"
            onClick={() => {
              dispensarFaixa();
              setPedidos([]);
            }}
            className="flex size-8 items-center justify-center rounded-md hover:bg-background/60"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </span>
      </div>
    </div>
  );
}
