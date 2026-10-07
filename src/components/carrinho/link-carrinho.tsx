"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { useCarrinho } from "./carrinho";

export function LinkCarrinho() {
  const quantidade = useCarrinho().length;
  const rotulo =
    quantidade === 0
      ? "Carrinho vazio"
      : `Carrinho com ${quantidade} ${quantidade === 1 ? "item" : "itens"}`;

  return (
    <Link
      href="/carrinho"
      aria-label={rotulo}
      className="relative inline-flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ShoppingCart aria-hidden="true" className="size-5" />
      {quantidade > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-highlight px-1 text-xs font-bold text-highlight-foreground tabular-nums"
        >
          {quantidade > 99 ? "99+" : quantidade}
        </span>
      )}
    </Link>
  );
}
