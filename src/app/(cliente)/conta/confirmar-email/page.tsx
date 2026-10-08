import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MailCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { caminhoSeguro } from "@/lib/redirecionamento";
import { tokenDeExemplo } from "@/servicos/confirmacao-email";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Confirme seu e-mail",
  robots: { index: false, follow: false },
};

export default function PaginaConfirmarEmail({
  searchParams,
}: PageProps<"/conta/confirmar-email">) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  searchParams,
}: Pick<PageProps<"/conta/confirmar-email">, "searchParams">) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  const { token, limite, proximo, indisponivel } = await searchParams;
  const destino = proximo ? caminhoSeguro(proximo, "/") : null;
  // Na produção, nunca há link na tela: só o e-mail prova que a pessoa é dona do endereço.
  const valor = tokenDeExemplo(token);
  const semEnvio = indisponivel === "1";

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <MailCheck aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Confirme seu e-mail</h1>
      {usuario.emailConfirmado ? (
        <p className="text-muted-foreground">Seu e-mail já está confirmado.</p>
      ) : semEnvio ? (
        <p role="alert" className="text-muted-foreground">
          O envio de e-mail não está disponível no momento, então não conseguimos mandar o link de
          confirmação para <strong>{usuario.email}</strong>. Sua conta foi criada e você já pode
          usá-la; tente pedir o link de novo mais tarde.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Enviamos um link de confirmação para <strong>{usuario.email}</strong>. Confirmar o e-mail
          liga à sua conta as compras que você fez sem conta com este mesmo e-mail.
        </p>
      )}
      {limite === "1" && (
        <p role="alert" className="text-sm text-destructive">
          Você pediu vários links seguidos. Espere um pouco antes de pedir outro.
        </p>
      )}
      {!usuario.emailConfirmado && valor && (
        <div className="w-full rounded-lg border border-dashed bg-highlight/20 p-4 text-left text-sm">
          <p className="mb-3">
            <strong>Ambiente de exemplo:</strong> o envio de e-mail (Resend) não está configurado.
            Este é o link que iria no e-mail:
          </p>
          {/* <a>: a rota de confirmação responde com redirecionamento, não com uma página. */}
          <a
            href={`/conta/confirmar?token=${encodeURIComponent(valor)}`}
            className={buttonVariants({ size: "touch" })}
          >
            Confirmar e-mail
          </a>
        </div>
      )}
      {destino ? (
        <Link href={destino} className={buttonVariants({ variant: "outline", size: "touch" })}>
          Continuar
        </Link>
      ) : (
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          Ir para a página inicial
        </Link>
      )}
    </div>
  );
}
