import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { comecarAVenderAcao } from "@/app/(cliente)/conta/acoes";
import { BotaoGoogle } from "@/components/conta/botao-google";
import { FormularioCadastro } from "@/components/conta/formularios";
import { Button } from "@/components/ui/button";
import { googleConfigurado } from "@/lib/google";
import { caminhoSeguro, destinoDeQuemJaEntrou } from "@/lib/redirecionamento";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Criar conta" };

// A página espera a sessão antes de qualquer conteúdo (para o redirecionamento sair como 307),
// então bloqueia no servidor em vez de gerar uma casca instantânea.
export const instant = false;

export default async function PaginaCadastro({ searchParams }: PageProps<"/cadastro">) {
  // Fotógrafo e gestor logados vão para a sua área (ou o ?proximo= seguro); o cliente fica, para
  // poder ativar a conta de fotógrafo.
  const usuario = await usuarioAtual();
  if (usuario) {
    const { proximo } = await searchParams;
    const destino = destinoDeQuemJaEntrou(
      usuario.papel,
      Array.isArray(proximo) ? proximo[0] : proximo,
      "cadastro",
    );
    if (destino) redirect(destino);
  }
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Formulario searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Formulario({ searchParams }: Pick<PageProps<"/cadastro">, "searchParams">) {
  const { tipo, proximo } = await searchParams;
  const vender = tipo === "fotografo";
  // Veio do link de um fotógrafo: depois do cadastro, volta para a biblioteca dele.
  const valor = Array.isArray(proximo) ? proximo[0] : proximo;
  const destino = valor ? caminhoSeguro(valor, "/") : undefined;
  const usuario = await usuarioAtual();
  return (
    <div className="flex flex-col gap-6">
      {googleConfigurado() && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <BotaoGoogle proximo={destino} texto="Comprar fotos com Google" />
            <BotaoGoogle vender texto="Vender fotos com Google" />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou crie com e-mail e senha
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      {vender && usuario?.papel === "cliente" && (
        <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-accent/40 p-5">
          <h2 className="text-lg font-semibold">Quer vender com a conta que você já tem?</h2>
          <p className="text-sm text-muted-foreground">
            Você entrou como <strong>{usuario.email}</strong>, uma conta de comprador. Ative a venda
            para abrir o painel do fotógrafo com esta mesma conta; suas compras continuam nela.
          </p>
          <form action={comecarAVenderAcao}>
            <Button type="submit" size="touch">
              Ativar minha conta de fotógrafo
            </Button>
          </form>
        </section>
      )}
      {/* key: ao trocar entre /cadastro e /cadastro?tipo=fotografo pelo menu, o formulário
          recomeça com o tipo de conta do link (o padrão de um campo só vale ao montar). */}
      <FormularioCadastro
        key={vender ? "fotografo" : "cliente"}
        papelInicial={vender ? "fotografo" : "cliente"}
        proximo={destino}
      />
      <p className="text-center text-sm text-muted-foreground">
        Ao criar a conta, você concorda com os{" "}
        <Link href="/termos" className="font-medium text-primary hover:underline">
          Termos de uso
        </Link>
        , a{" "}
        <Link href="/politica-de-conteudo" className="font-medium text-primary hover:underline">
          Política de conteúdo
        </Link>{" "}
        (para quem vende) e a{" "}
        <Link href="/privacidade" className="font-medium text-primary hover:underline">
          Política de privacidade
        </Link>
        .
      </p>
    </div>
  );
}
