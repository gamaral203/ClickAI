import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MailCheck } from "lucide-react";

import { FormularioCodigoEmail } from "@/components/conta/formulario-codigo-email";
import { buttonVariants } from "@/components/ui/button";
import { emProducao } from "@/db/conexao";
import { emailConfigurado } from "@/lib/email";
import { confirmacaoPendente } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Confirme seu e-mail",
  robots: { index: false, follow: false },
};

// Confirmação do e-mail por código (src/servicos/confirmacao-email.ts): depois do cadastro com
// senha, ou do login de uma conta que ainda não confirmou o e-mail.
export default function PaginaCodigoEmail({ searchParams }: PageProps<"/cadastro/codigo">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-10 sm:py-12">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const AVISOS_ENVIO: Record<string, string> = {
  indisponivel:
    "Não conseguimos enviar o código agora. Tente reenviar em alguns minutos; se você já recebeu um código, ele continua valendo.",
  limite:
    "Muitos códigos pedidos seguidos para este e-mail. Use o último código que chegou ou espere um pouco para pedir outro.",
};

async function Conteudo({ searchParams }: Pick<PageProps<"/cadastro/codigo">, "searchParams">) {
  const pendente = await confirmacaoPendente();
  if (!pendente) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Confirme seu e-mail</h1>
        <p className="text-muted-foreground">
          Não há nenhum cadastro esperando confirmação neste aparelho. O cadastro que não é
          confirmado em 24 horas é descartado: é só fazer de novo.
        </p>
        <Link href="/cadastro" className={buttonVariants({ size: "touch" })}>
          Criar conta
        </Link>
        <Link
          href="/entrar"
          className="text-center text-sm font-medium text-primary hover:underline"
        >
          Já confirmei, quero entrar
        </Link>
      </div>
    );
  }
  const { envio } = await searchParams;
  const aviso = typeof envio === "string" ? AVISOS_ENVIO[envio] : undefined;
  // Só fora da produção: sem o Resend, o código vai para o log do servidor (src/servicos/mensagens.ts).
  const codigoNoLog = !emailConfigurado() && !emProducao();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MailCheck aria-hidden="true" className="size-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Confirme seu e-mail</h1>
        <p className="text-muted-foreground">
          Enviamos um código de 6 números para{" "}
          <strong className="break-words text-foreground">{pendente.email}</strong>. Digite abaixo
          para liberar sua conta.
        </p>
      </div>
      {aviso && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {aviso}
        </p>
      )}
      {codigoNoLog && (
        <p className="rounded-lg border border-dashed bg-highlight/20 p-3 text-sm">
          <strong>Ambiente de desenvolvimento:</strong> o envio de e-mail (Resend) não está
          configurado, então o código aparece no terminal do servidor.
        </p>
      )}
      <FormularioCodigoEmail esperaInicial={pendente.esperaReenvio} />
      <p className="text-center text-sm text-muted-foreground">
        Não chegou? Confira o spam e a aba Promoções. E-mail errado?{" "}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Cadastrar com outro e-mail
        </Link>
      </p>
    </div>
  );
}
