import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Download,
  Images,
  Mail,
  ScanFace,
  Search,
  ShieldCheck,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

// Página para quem compra: como encontrar, pagar e baixar as fotos, e o que acontece com a
// selfie. Mostrar isso antes da compra aumenta a confiança (docs/tarefas.md).

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "Encontre suas fotos com uma selfie, pague com Pix ou cartão e baixe os originais na hora.",
};

const passos = [
  {
    icone: Search,
    titulo: "Encontre o seu evento",
    texto:
      "Busque pela corrida, festa ou formatura em que você estava, ou abra o link e o QR Code que o fotógrafo divulgou.",
  },
  {
    icone: ScanFace,
    titulo: "Ache as suas fotos com uma selfie",
    texto:
      "Tire uma selfie ou use uma foto sua e mostramos só as fotos em que você aparece. Nas corridas, dá para buscar também pelo número de peito.",
  },
  {
    icone: Images,
    titulo: "Escolha as fotos",
    texto:
      "Veja as prévias com marca d'água e coloque no carrinho as que quiser, de um ou de vários eventos. Muitos fotógrafos dão desconto para quem leva mais fotos.",
  },
  {
    icone: CreditCard,
    titulo: "Pague com Pix ou cartão",
    texto:
      "Sem precisar criar conta: só nome e e-mail. O Pix é aprovado na hora; o código vale por 1 hora.",
  },
  {
    icone: Download,
    titulo: "Baixe os originais",
    texto:
      "Logo depois do pagamento, as fotos são liberadas em alta resolução e sem marca d'água, para baixar quantas vezes quiser.",
  },
];

const perguntas = [
  {
    pergunta: "A minha selfie fica guardada?",
    resposta:
      "Não. Ela é usada só para comparar com as fotos daquele evento e é descartada em seguida. Não vai para o nosso banco de dados nem para os registros do sistema.",
  },
  {
    pergunta: "Como recebo as fotos?",
    resposta:
      "Na própria tela, logo depois do pagamento, e também por e-mail (e pelo WhatsApp, se você pedir). O link do e-mail é o seu acesso às fotos compradas.",
  },
  {
    pergunta: "Perdi o e-mail. E agora?",
    resposta:
      "Crie uma conta com o mesmo e-mail da compra e confirme o endereço: as compras aparecem em Minhas compras.",
  },
  {
    pergunta: "As fotos vêm com marca d'água?",
    resposta:
      "Não. A marca d'água fica só nas prévias. A foto comprada é o original, na resolução que o fotógrafo enviou.",
  },
  {
    pergunta: "Posso postar as fotos?",
    resposta:
      "Pode: as fotos são para uso pessoal, inclusive nas redes sociais. Marque o fotógrafo e o @clicouai. Não é permitido revender nem usar as fotos para fins comerciais.",
  },
  {
    pergunta: "Apareço numa foto e não quero que ela fique à venda.",
    resposta:
      "Abra a foto e use o “Denunciar esta foto ou pedir remoção”. A equipe analisa e responde por e-mail.",
  },
];

export default function PaginaComoFunciona() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Como funciona o ClicouAí
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Os fotógrafos publicam as fotos dos eventos. Você encontra as suas em segundos, paga e
          baixa o original.
        </p>
      </header>

      <ol className="flex flex-col gap-4">
        {passos.map(({ icone: Icone, titulo, texto }, i) => (
          <li key={titulo} className="flex gap-4 rounded-xl border p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Icone aria-hidden="true" className="size-5" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Passo {i + 1}</span>
              <span className="text-lg font-semibold">{titulo}</span>
              <span className="text-muted-foreground">{texto}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3 rounded-xl bg-accent p-5 text-accent-foreground">
          <ShieldCheck aria-hidden="true" className="size-6 shrink-0" />
          <p>
            <strong>Pagamento seguro.</strong> Os dados do cartão vão direto para o processador de
            pagamento e nunca passam pelo ClicouAí.
          </p>
        </div>
        <div className="flex gap-3 rounded-xl bg-accent p-5 text-accent-foreground">
          <Mail aria-hidden="true" className="size-6 shrink-0" />
          <p>
            <strong>Sem cadastro.</strong> Basta nome e e-mail. Se quiser, crie uma conta para ter
            todas as compras num só lugar.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Perguntas frequentes</h2>
        <div className="flex flex-col divide-y rounded-xl border">
          {perguntas.map(({ pergunta, resposta }) => (
            <details key={pergunta} className="group p-4">
              <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  {pergunta}
                  <span aria-hidden="true" className="text-muted-foreground group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-muted-foreground">{resposta}</p>
            </details>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Mais detalhes sobre os seus dados na{" "}
          <Link href="/privacidade" className="font-medium text-primary hover:underline">
            política de privacidade
          </Link>
          .
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/eventos" className={buttonVariants({ size: "touch" })}>
          Encontrar meu evento
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
        <Link
          href="/cadastro?tipo=fotografo"
          className={buttonVariants({ variant: "outline", size: "touch" })}
        >
          Sou fotógrafo
        </Link>
      </div>
    </div>
  );
}
