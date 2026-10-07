"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { pagarComCartaoAcao } from "@/app/(cliente)/pedidos/[id]/acoes";

// Card Payment Brick do Mercado Pago: os campos do cartão são iframes do próprio Mercado Pago,
// então o número do cartão nunca passa pelo nosso código nem pelo nosso servidor. O Brick só
// devolve um token de uso único, que o servidor usa para cobrar o total do pedido.
// https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/introduction

type Brick = { unmount: () => void };
type MercadoPagoSdk = new (
  chavePublica: string,
  opcoes: { locale: string },
) => {
  bricks: () => {
    create: (tipo: "cardPayment", containerId: string, config: unknown) => Promise<Brick>;
  };
};

declare global {
  interface Window {
    MercadoPago?: MercadoPagoSdk;
  }
}

const CONTAINER = "cartao-mercadopago";

const MENSAGENS = {
  recusado: "O pagamento foi recusado. Confira os dados ou tente outro cartão.",
  indisponivel: "Este pedido não pode mais ser pago. Atualize a página.",
  em_analise: "Pagamento em análise. A página atualiza sozinha quando for confirmado.",
};

export function CartaoMercadoPago({
  pedidoId,
  token,
  totalCentavos,
  chavePublica,
}: {
  pedidoId: string;
  token: string | null;
  totalCentavos: number;
  chavePublica: string;
}) {
  const router = useRouter();
  const [sdkPronto, setSdkPronto] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const brick = useRef<Brick | null>(null);

  useEffect(() => {
    if (!sdkPronto || !window.MercadoPago) return;
    let cancelado = false;
    const mp = new window.MercadoPago(chavePublica, { locale: "pt-BR" });

    mp.bricks()
      .create("cardPayment", CONTAINER, {
        // Só para mostrar o valor; o servidor cobra o total do pedido, não este número.
        initialization: { amount: totalCentavos / 100 },
        customization: {
          paymentMethods: { maxInstallments: 1 },
          visual: { style: { theme: "default" } },
        },
        callbacks: {
          onReady: () => {},
          onError: (erro: unknown) => console.error("Card Payment Brick", erro),
          onSubmit: async (
            dadosCartao: Record<string, unknown>,
            extra?: { paymentTypeId?: string },
          ) => {
            setMensagem(null);
            const resultado = await pagarComCartaoAcao(pedidoId, token, {
              ...dadosCartao,
              payment_type_id: extra?.paymentTypeId,
            }).catch(() => ({ ok: false as const, motivo: "recusado" as const }));

            if (resultado.ok) {
              if (resultado.situacao === "em_analise") setMensagem(MENSAGENS.em_analise);
              router.refresh();
              return;
            }
            setMensagem(MENSAGENS[resultado.motivo]);
            // Rejeitar a promessa devolve o Brick ao estado de edição para nova tentativa.
            throw new Error(resultado.motivo);
          },
        },
      })
      .then((criado) => {
        if (cancelado) criado.unmount();
        else brick.current = criado;
      });

    return () => {
      cancelado = true;
      brick.current?.unmount();
      brick.current = null;
    };
  }, [sdkPronto, chavePublica, totalCentavos, pedidoId, token, router]);

  return (
    <div className="flex flex-col gap-3">
      <Script src="https://sdk.mercadopago.com/js/v2" onReady={() => setSdkPronto(true)} />
      <div id={CONTAINER} />
      {!sdkPronto && <div className="h-80 animate-pulse rounded-lg bg-muted" />}
      {mensagem && (
        <p role="status" className="text-sm font-medium">
          {mensagem}
        </p>
      )}
    </div>
  );
}
