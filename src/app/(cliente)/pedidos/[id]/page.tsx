import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, Clock, Copy, Download, XCircle } from "lucide-react";
import { z } from "zod";

import { BotaoSimularPagamento } from "@/components/carrinho/botao-simular-pagamento";
import { CartaoMercadoPago } from "@/components/pagamento/cartao-mercadopago";
import { AtualizadorDePagamento, BotaoGerarPix, QrCodePix } from "@/components/pagamento/pix";
import { buttonVariants } from "@/components/ui/button";
import { contarDownloads, detalharItensDoPedido } from "@/dados";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { mercadoPagoConfigurado } from "@/lib/mercadopago";
import { buscarPedidoAtualizado } from "@/servicos/pagamentos";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Seu pedido",
  // O link carrega o token de acesso: nunca indexar.
  robots: { index: false, follow: false },
};

// Token do link (convidado) ou sessão do dono do pedido (cliente logado).
const parametros = z.object({ id: z.uuid(), token: z.string().min(20).max(100).nullable() });

export default function PaginaPedido(props: PageProps<"/pedidos/[id]">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <ConteudoPedido {...props} />
      </Suspense>
    </div>
  );
}

async function ConteudoPedido({ params, searchParams }: PageProps<"/pedidos/[id]">) {
  const { id } = await params;
  const { token } = await searchParams;
  const dados = parametros.safeParse({
    id,
    token: (Array.isArray(token) ? token[0] : token) ?? null,
  });
  if (!dados.success) notFound();

  const usuario = await usuarioAtual();
  // Com o Mercado Pago, confere a order lá antes de mostrar (cobre o webhook atrasado).
  const encontrado = await buscarPedidoAtualizado(dados.data.id, {
    token: dados.data.token,
    clienteId: usuario?.id,
  });
  // Sem acesso e pedido inexistente dão a mesma resposta, para não revelar quais ids existem.
  if (!encontrado) notFound();
  const { pedido, itens } = encontrado;
  const detalhes = await detalharItensDoPedido(itens);
  const baixados = await contarDownloads(itens.map((i) => i.id));
  const gateway = mercadoPagoConfigurado();
  const chavePublica = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? "";

  return (
    <>
      {pedido.status === "pendente" && (
        <section className="flex flex-col gap-4 rounded-xl border p-6">
          <div className="flex items-center gap-3">
            <Clock aria-hidden="true" className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Aguardando pagamento</h1>
          </div>
          <p className="text-muted-foreground">
            {pedido.metodo === "pix"
              ? `Pague com o Pix abaixo até ${formatarDataEHora(pedido.expiraEm)}. As fotos são liberadas assim que o pagamento for confirmado.`
              : "Preencha os dados do cartão abaixo. O pagamento é à vista, e as fotos são liberadas assim que ele for confirmado."}
          </p>
          {gateway ? (
            <>
              <AtualizadorDePagamento />
              {pedido.metodo === "pix" &&
                (pedido.pix ? (
                  <QrCodePix
                    copiaECola={pedido.pix.copiaECola}
                    qrCodeBase64={pedido.pix.qrCodeBase64}
                  />
                ) : (
                  <BotaoGerarPix pedidoId={pedido.id} token={dados.data.token} />
                ))}
              {pedido.metodo === "cartao" && (
                <CartaoMercadoPago
                  pedidoId={pedido.id}
                  token={dados.data.token}
                  totalCentavos={pedido.totalCentavos}
                  chavePublica={chavePublica}
                />
              )}
            </>
          ) : (
            <>
              {pedido.metodo === "pix" && (
                <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Copy aria-hidden="true" className="size-4" />
                    Pix copia e cola (exemplo)
                  </p>
                  <code className="text-xs break-all text-muted-foreground">
                    00020126580014BR.GOV.BCB.PIX-EXEMPLO-{pedido.id}
                  </code>
                </div>
              )}
              <div className="rounded-lg border border-dashed border-highlight-foreground/30 bg-highlight/20 p-4">
                <p className="mb-3 text-sm">
                  <strong>Ambiente de exemplo:</strong> sem credenciais do Mercado Pago. Use o botão
                  para simular a confirmação, como o webhook fará.
                </p>
                <BotaoSimularPagamento pedidoId={pedido.id} token={dados.data.token} />
              </div>
            </>
          )}
        </section>
      )}

      {pedido.status === "pago" && (
        <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-accent p-6 text-accent-foreground">
          <div className="flex items-center gap-3">
            <CheckCircle2 aria-hidden="true" className="size-6" />
            <h1 className="text-2xl font-bold tracking-tight">Pagamento confirmado</h1>
          </div>
          <p>
            Obrigado, {pedido.nomeComprador.split(" ")[0]}! Suas fotos estão liberadas. Guarde este
            link: ele é o seu acesso às fotos compradas.
          </p>
        </section>
      )}

      {(pedido.status === "expirado" || pedido.status === "cancelado") && (
        <section className="flex flex-col gap-3 rounded-xl border p-6">
          <div className="flex items-center gap-3">
            <XCircle aria-hidden="true" className="size-6 text-destructive" />
            <h1 className="text-2xl font-bold tracking-tight">
              {pedido.status === "expirado" ? "O prazo para pagar acabou" : "Pedido cancelado"}
            </h1>
          </div>
          <p className="text-muted-foreground">
            Nenhum valor foi cobrado. Você pode montar o carrinho de novo e fazer outro pedido.
          </p>
          <Link href="/eventos" className={buttonVariants({ size: "touch", className: "w-fit" })}>
            Voltar aos eventos
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">
          Itens do pedido ({detalhes.length}) · {formatarPreco(pedido.totalCentavos)}
        </h2>
        <ul className="flex flex-col divide-y rounded-xl border">
          {detalhes.map(({ item, tipo, urlMiniatura, eventoTitulo }) => (
            <li key={item.id} className="flex items-center gap-4 p-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                <Image src={urlMiniatura} alt="" fill sizes="64px" className="object-cover" />
              </div>
              <span className="flex flex-1 flex-col text-sm">
                <span className="font-medium">{tipo === "video" ? "Vídeo" : "Foto"}</span>
                <span className="text-muted-foreground">{eventoTitulo}</span>
              </span>
              {pedido.status === "pago" ? (
                <span className="flex flex-col items-end gap-1">
                  {/* <a> e não <Link>: a rota devolve o arquivo como anexo, não uma página. */}
                  <a
                    download
                    href={linkDownload(item.id, dados.data.token)}
                    className={buttonVariants({ variant: "outline", size: "touch" })}
                  >
                    <Download aria-hidden="true" data-icon="inline-start" />
                    Baixar original
                  </a>
                  {(baixados.get(item.id) ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Baixado{" "}
                      {baixados.get(item.id) === 1 ? "1 vez" : `${baixados.get(item.id)} vezes`}
                    </span>
                  )}
                </span>
              ) : (
                <span className="font-semibold tabular-nums">
                  {formatarPreco(item.precoCentavos)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Pedido em nome de {pedido.nomeComprador} ({pedido.emailComprador}).
        </p>
      </section>
    </>
  );
}

/** Com o token do link quando a pessoa entrou por ele; sem token, vale a sessão do dono. */
function linkDownload(itemId: string, token: string | null) {
  return token
    ? `/api/download/${itemId}?token=${encodeURIComponent(token)}`
    : `/api/download/${itemId}`;
}
