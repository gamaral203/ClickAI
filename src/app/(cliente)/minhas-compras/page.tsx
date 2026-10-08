import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, Download, MailWarning, ShoppingBag } from "lucide-react";

import { reenviarConfirmacaoAcao } from "@/app/(cliente)/conta/acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  contarDownloads,
  detalharItensDoPedido,
  listarPedidosDoCliente,
  type StatusPedido,
} from "@/dados";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Minhas compras",
  robots: { index: false, follow: false },
};

export default function PaginaMinhasCompras({ searchParams }: PageProps<"/minhas-compras">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Minhas compras</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const ROTULO_STATUS: Record<StatusPedido, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  expirado: "Prazo encerrado",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

async function Conteudo({ searchParams }: Pick<PageProps<"/minhas-compras">, "searchParams">) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar?proximo=/minhas-compras");

  const { confirmacao } = await searchParams;
  const pedidos = await listarPedidosDoCliente(usuario.id);
  const comDetalhes = await Promise.all(
    pedidos.map(async ({ pedido, itens }) => ({
      pedido,
      detalhes: await detalharItensDoPedido(itens),
      baixados: await contarDownloads(itens.map((i) => i.id)),
    })),
  );

  return (
    <>
      {confirmacao === "invalida" && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-destructive">
          O link de confirmação é inválido ou já foi usado. Gere um novo abaixo.
        </p>
      )}
      {typeof confirmacao === "string" && /^\d+$/.test(confirmacao) && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-accent p-4 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          E-mail confirmado.
          {Number(confirmacao) > 0 &&
            ` ${confirmacao === "1" ? "1 compra feita" : `${confirmacao} compras feitas`} sem conta com este e-mail ${confirmacao === "1" ? "foi ligada" : "foram ligadas"} à sua conta.`}
        </p>
      )}

      {!usuario.emailConfirmado && (
        <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
          <MailWarning aria-hidden="true" className="size-6 shrink-0 text-primary" />
          <p className="flex-1 text-sm">
            Confirme o e-mail <strong>{usuario.email}</strong> para ver aqui também as compras que
            você fez sem conta.
          </p>
          <form action={reenviarConfirmacaoAcao}>
            <Button type="submit" variant="outline" size="touch">
              Confirmar e-mail
            </Button>
          </form>
        </div>
      )}

      {comDetalhes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
          <ShoppingBag aria-hidden="true" className="size-10 text-muted-foreground" />
          <p className="text-lg font-semibold">Você ainda não comprou fotos</p>
          <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
            Encontrar meu evento
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-6">
          {comDetalhes.map(({ pedido, detalhes, baixados }) => (
            <li key={pedido.id} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-semibold">{formatarDataEHora(pedido.criadoEm)}</span>
                  <span className="text-sm text-muted-foreground">
                    {detalhes.length} {detalhes.length === 1 ? "item" : "itens"} ·{" "}
                    {formatarPreco(pedido.totalCentavos)}
                  </span>
                </div>
                <span
                  className={
                    pedido.status === "pago"
                      ? "rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground"
                      : "rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground"
                  }
                >
                  {ROTULO_STATUS[pedido.status]}
                </span>
              </div>

              <ul className="flex flex-col divide-y">
                {detalhes.map(({ item, tipo, urlMiniatura, eventoTitulo }) => (
                  <li key={item.id} className="flex items-center gap-4 py-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image src={urlMiniatura} alt="" fill sizes="56px" className="object-cover" />
                    </div>
                    <span className="flex flex-1 flex-col text-sm">
                      <span className="font-medium">{tipo === "video" ? "Vídeo" : "Foto"}</span>
                      <span className="text-muted-foreground">{eventoTitulo}</span>
                    </span>
                    {pedido.status === "pago" && (
                      <span className="flex flex-col items-end gap-1">
                        {/* Sem token: a rota confere a sessão do dono do pedido. */}
                        <a
                          download
                          href={`/api/download/${item.id}`}
                          className={buttonVariants({ variant: "outline", size: "touch" })}
                        >
                          <Download aria-hidden="true" data-icon="inline-start" />
                          Baixar
                        </a>
                        {(baixados.get(item.id) ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Baixado{" "}
                            {baixados.get(item.id) === 1
                              ? "1 vez"
                              : `${baixados.get(item.id)} vezes`}
                          </span>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {pedido.status === "pendente" && (
                <Link
                  href={`/pedidos/${pedido.id}`}
                  className={buttonVariants({ size: "touch", className: "w-fit" })}
                >
                  Concluir pagamento
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t pt-6 text-sm text-muted-foreground">
        Dúvidas sobre compras e downloads na{" "}
        <Link href="/ajuda" className="font-medium text-primary hover:underline">
          central de ajuda
        </Link>
        . Quer sair do ClicouAí?{" "}
        <Link href="/conta/excluir" className="font-medium text-primary hover:underline">
          Excluir minha conta
        </Link>
        .
      </p>
    </>
  );
}
