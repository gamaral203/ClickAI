import Link from "next/link";
import { Camera, LogOut } from "lucide-react";

import { sairParaComprarAcao } from "@/app/(cliente)/conta/acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Papel } from "@/dados/tipos";

/**
 * Carrinho, checkout e Minhas compras abertos por quem vende: conta de fotógrafo (ou de gestor)
 * não compra fotos. Em vez da tela de compra, uma página curta para sair da conta ou voltar ao
 * painel. A regra vale no servidor (checkout e criação do pedido); esta tela só explica.
 */
export function AvisoContaDeFotografo({ papel }: { papel: Papel }) {
  const conta = papel === "admin" ? "de gestão" : "de fotógrafo";
  return (
    <section
      aria-labelledby="titulo-aviso-compra"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Camera aria-hidden="true" className="size-7" />
      </span>
      <h1 id="titulo-aviso-compra" className="text-2xl font-bold tracking-tight text-balance">
        Para comprar fotos, saia da sua conta {conta}
      </h1>
      <p className="text-pretty text-muted-foreground">
        Conta de quem vende não compra fotos. Saia da conta para comprar como convidado, ou entre
        com uma conta de cliente.
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <form action={sairParaComprarAcao}>
          <Button type="submit" size="touch" className="w-full">
            <LogOut aria-hidden="true" data-icon="inline-start" />
            Sair da conta
          </Button>
        </form>
        <Link href="/painel" className={buttonVariants({ variant: "outline", size: "touch" })}>
          Voltar ao painel
        </Link>
      </div>
    </section>
  );
}
