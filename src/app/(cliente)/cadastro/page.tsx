import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BotaoGoogle } from "@/components/conta/botao-google";
import { FormularioCadastro } from "@/components/conta/formularios";
import { googleConfigurado } from "@/lib/google";
import { caminhoSeguro } from "@/lib/redirecionamento";

export const metadata: Metadata = { title: "Criar conta" };

export default function PaginaCadastro({ searchParams }: PageProps<"/cadastro">) {
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
      <FormularioCadastro papelInicial={vender ? "fotografo" : "cliente"} proximo={destino} />
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
