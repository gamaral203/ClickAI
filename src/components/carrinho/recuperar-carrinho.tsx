"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { adicionarAoCarrinho } from "./carrinho";

/** Põe de volta no carrinho os itens do pedido expirado e abre o carrinho. */
export function RecuperarCarrinho({ ids }: { ids: string[] }) {
  const router = useRouter();
  useEffect(() => {
    for (const id of ids) adicionarAoCarrinho(id);
    router.replace("/carrinho");
  }, [ids, router]);
  return (
    <p className="flex items-center gap-2 text-muted-foreground" role="status">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      Colocando suas fotos de volta no carrinho…
    </p>
  );
}
