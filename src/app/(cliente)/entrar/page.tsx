import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2 } from "lucide-react";

import { BotaoGoogle, ERROS_GOOGLE } from "@/components/conta/botao-google";
import { FormularioEntrar } from "@/components/conta/formularios";
import { googleConfigurado } from "@/lib/google";
import { caminhoSeguro, destinoDeQuemJaEntrou } from "@/lib/redirecionamento";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

const ERROS: Record<string, string> = {
  conta_existente:
    "Este e-mail já tem uma conta (por exemplo, criada com o Google). Entre com ela ou use outro e-mail.",
};

// A página espera a sessão antes de qualquer conteúdo (para o redirecionamento sair como 307),
// então bloqueia no servidor em vez de gerar uma casca instantânea.
export const instant = false;

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  // Quem já entrou vai para a sua área (painel, gestão ou compras) ou para o ?proximo= seguro.
  const usuario = await usuarioAtual();
  if (usuario) {
    const { proximo } = await searchParams;
    const destino = destinoDeQuemJaEntrou(
      usuario.papel,
      Array.isArray(proximo) ? proximo[0] : proximo,
      "entrar",
    );
    if (destino) redirect(destino);
  }
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <Formulario searchParams={searchParams} />
      </Suspense>
      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Ambiente de exemplo: entre com <strong>ana@exemplo.com</strong> (cliente),{" "}
        <strong>lia@exemplo.com</strong> (fotógrafa) ou <strong>admin@exemplo.com</strong> (gestão),
        senha <strong>clicouai123</strong>.
      </p>
    </div>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/entrar">, "searchParams">) {
  const { proximo, erro, saiu, senha } = await searchParams;
  const valor = Array.isArray(proximo) ? proximo[0] : proximo;
  const destino = valor ? caminhoSeguro(valor) : undefined;
  const mensagem = typeof erro === "string" ? (ERROS_GOOGLE[erro] ?? ERROS[erro]) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {saiu === "todos" && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Você saiu de todos os aparelhos. Entre de novo para continuar.
        </p>
      )}
      {senha === "redefinida" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          Senha redefinida. As outras sessões da conta foram encerradas; entre com a senha nova.
        </p>
      )}
      {mensagem && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {mensagem}
        </p>
      )}
      {googleConfigurado() && (
        <>
          <BotaoGoogle proximo={destino} />
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou com e-mail e senha
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <FormularioEntrar proximo={destino} />
    </div>
  );
}
