"use client";

import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

import { adicionarAoCarrinho, MAXIMO_ITENS, useCarrinho } from "./carrinho";

export function BotaoAdicionar({ fotoId }: { fotoId: string }) {
  const ids = useCarrinho();
  const noCarrinho = ids.includes(fotoId);
  const cheio = ids.length >= MAXIMO_ITENS;

  if (noCarrinho) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primary" role="status">
          <Check aria-hidden="true" className="size-4" />
          No carrinho
        </p>
        <Link href="/carrinho" className={buttonVariants({ variant: "outline", size: "touch" })}>
          Ver carrinho
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="touch" disabled={cheio} onClick={() => adicionarAoCarrinho(fotoId)}>
        <ShoppingCart aria-hidden="true" data-icon="inline-start" />
        Adicionar ao carrinho
      </Button>
      {cheio && (
        <p className="text-sm text-muted-foreground">
          O carrinho chegou ao limite de {MAXIMO_ITENS} itens. Finalize esta compra primeiro.
        </p>
      )}
    </div>
  );
}
