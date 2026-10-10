import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FormularioCodigoLogin } from "@/components/conta/formulario-codigo-login";
import { emProducao } from "@/db/conexao";
import { emailConfigurado } from "@/lib/email";
import { mascararEmail } from "@/lib/mascarar-email";
import { esperaParaReenviarCodigoDeLogin, loginPendente } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Verificação em duas etapas",
  robots: { index: false, follow: false },
};

// Segunda etapa do login (src/servicos/sessao.ts): a senha (ou o Google) já confere; falta o
// código enviado ao e-mail do gestor (src/servicos/codigo-login.ts) ou o do app autenticador.
export default function PaginaCodigo({ searchParams }: PageProps<"/entrar/codigo">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-10 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Verificação em duas etapas</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const AVISOS_ENVIO: Record<string, string> = {
  indisponivel:
    "Não conseguimos enviar o código agora. Tente reenviar em alguns minutos; se um código já chegou, ele continua valendo.",
  limite:
    "Muitos códigos pedidos seguidos. Use o último código que chegou ou espere um pouco para pedir outro.",
};

async function Conteudo({ searchParams }: Pick<PageProps<"/entrar/codigo">, "searchParams">) {
  const pendente = await loginPendente();
  if (!pendente) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          O tempo para digitar o código acabou ou o login não começou neste aparelho.
        </p>
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar de novo
        </Link>
      </div>
    );
  }
  const totp = pendente.usuario.mfaAtivo;
  if (!pendente.loginId) return <FormularioCodigoLogin porEmail={null} totp={totp} />;

  const { envio } = await searchParams;
  const aviso = typeof envio === "string" ? AVISOS_ENVIO[envio] : undefined;
  const espera = await esperaParaReenviarCodigoDeLogin(pendente);
  // Só fora da produção: sem o Resend, o código vai para o log do servidor (src/servicos/mensagens.ts).
  const codigoNoLog = !emailConfigurado() && !emProducao();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">
        Enviamos um código de 6 números para o <span className="whitespace-nowrap">e-mail</span>{" "}
        <strong className="break-words text-foreground">
          {mascararEmail(pendente.usuario.email)}
        </strong>
        . Digite abaixo para entrar na gestão.
        {totp && " Ou use o código do seu aplicativo autenticador."}
      </p>
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
      <FormularioCodigoLogin porEmail={{ espera }} totp={totp} />
    </div>
  );
}
