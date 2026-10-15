"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ShoppingCart, X } from "lucide-react";

import { useCarrinho } from "@/components/carrinho/carrinho";
import { Obturador } from "@/components/galeria/obturador";
import { cn } from "@/lib/utils";

/**
 * Barra fixa no pé da galeria: "Limpar" (só com seleção), o obturador no meio (abre o painel da
 * seleção) com o contador, e "Ver carrinho" (ativo quando o carrinho tem itens).
 */
export function BarraSelecao({
  quantidade,
  resumo,
  painelAberto,
  aoAbrir,
  aoLimpar,
}: {
  quantidade: number;
  /** Linha embaixo do obturador: "3 fotos · R$ 45,00", ou um aviso. */
  resumo: string;
  painelAberto: boolean;
  aoAbrir: () => void;
  aoLimpar: () => void;
}) {
  const reduzir = useReducedMotion();
  const noCarrinho = useCarrinho().length;
  const acao =
    "inline-flex h-11 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-highlight/70";

  return (
    // No celular, a barra deixa à direita o lugar do botão do chat de ajuda (fixo no canto).
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pr-[4.75rem] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-3 sm:px-3 print:hidden">
      <div
        role="region"
        aria-label="Seleção de fotos"
        className="pointer-events-auto mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-end gap-1 rounded-3xl bg-profundo/95 px-2 pt-1.5 pb-2 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
      >
        <div className="flex justify-start self-center">
          {quantidade > 0 && (
            <button type="button" onClick={aoLimpar} className={cn(acao, "hover:bg-white/10")}>
              <X aria-hidden="true" className="size-4" />
              Limpar
            </button>
          )}
        </div>

        <div className="-mt-9 flex flex-col items-center gap-1">
          <motion.button
            type="button"
            onClick={aoAbrir}
            whileTap={reduzir ? undefined : { scale: 0.9 }}
            aria-haspopup="dialog"
            aria-expanded={painelAberto}
            aria-label={
              quantidade > 0
                ? `Ver seleção (${quantidade} ${quantidade === 1 ? "item" : "itens"})`
                : "Ver seleção"
            }
            className="relative flex size-16 items-center justify-center rounded-full bg-primary shadow-lg ring-4 ring-profundo outline-none focus-visible:ring-highlight"
          >
            <Obturador aberto={painelAberto} className="size-12" />
            {quantidade > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-highlight px-1.5 text-xs font-bold text-highlight-foreground tabular-nums ring-2 ring-profundo"
              >
                {quantidade}
              </span>
            )}
          </motion.button>
          <p
            aria-live="polite"
            className="max-w-28 text-center text-xs leading-tight text-balance text-white/80 tabular-nums"
          >
            {resumo}
          </p>
        </div>

        <div className="flex justify-end self-center">
          {noCarrinho > 0 ? (
            <Link href="/carrinho" className={cn(acao, "hover:bg-white/10")}>
              <span className="relative">
                <ShoppingCart aria-hidden="true" className="size-5" />
                <span className="absolute -top-2 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-[0.65rem] font-bold text-highlight-foreground tabular-nums">
                  {noCarrinho}
                </span>
              </span>
              <span className="ml-1 max-sm:sr-only">Ver carrinho</span>
              <span className="sr-only"> ({noCarrinho} no carrinho)</span>
              <ArrowRight aria-hidden="true" className="hidden size-4 sm:block" />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(acao, "cursor-not-allowed text-white/45")}>
              <ShoppingCart aria-hidden="true" className="size-5" />
              <span className="max-sm:sr-only">Ver carrinho</span>
              <span className="sr-only"> (vazio)</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
