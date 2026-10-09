import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CircleAlert, KeyRound, ShieldCheck } from "lucide-react";

import { FormularioSenha } from "@/components/conta/formulario-senha";
import { SairDeTodos } from "@/components/conta/sair-de-todos";
import { podeUsarPainel, usuarioAtual } from "@/servicos/sessao";
import { situacaoDaSenha } from "@/servicos/troca-senha";

// Senha e segurança, para todo usuário logado (cliente, fotógrafo e gestor): troca de senha (ou
// criação, na conta só com o Google) e "Sair de todos os dispositivos". As regras ficam em
// src/servicos/troca-senha.ts. A verificação em duas etapas continua em Perfil e recebimento.

export const metadata: Metadata = {
  title: "Senha e segurança",
  robots: { index: false, follow: false },
};

export default function PaginaSeguranca() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const linkTexto = "font-medium text-primary hover:underline";

async function Conteudo() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar?proximo=/conta/seguranca");

  const situacao = await situacaoDaSenha(usuario);
  const painel = podeUsarPainel(usuario);
  const voltar = painel ? "/painel/perfil" : "/minhas-compras";

  return (
    <>
      <Link
        href={voltar}
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Senha e segurança</h1>
        <p className="text-muted-foreground">
          Conta de <strong className="text-foreground">{usuario.email}</strong>.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound aria-hidden="true" className="size-5" />
          {situacao === "so_google" ? "Criar uma senha" : "Trocar senha"}
        </h2>
        {situacao === "gestor_ambiente" ? (
          <div role="status" className="flex gap-3 rounded-lg bg-accent p-4 text-accent-foreground">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p className="leading-relaxed">
              A senha desta conta de gestor é definida pela equipe técnica, na configuração do
              servidor, e não pode ser trocada por aqui. Para trocá-la, peça a quem cuida do deploy.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {situacao === "so_google"
                ? "Sua conta entra pelo Google. Se quiser, crie uma senha para entrar também com e-mail e senha; o Google continua funcionando."
                : "Ao trocar, as sessões nos outros aparelhos são encerradas; neste, você continua conectado. Enviamos um aviso para o seu e-mail."}
            </p>
            <FormularioSenha
              email={usuario.email}
              temSenha={situacao === "com_senha"}
              pedeCodigo={usuario.mfaAtivo}
            />
          </>
        )}
      </section>

      {painel && (
        <section className="flex flex-col gap-2 rounded-xl border p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck aria-hidden="true" className="size-5" />
            Verificação em duas etapas
          </h2>
          <p className="text-sm text-muted-foreground">
            {usuario.mfaAtivo ? "Ligada." : "Desligada."} Ligue, desligue ou gere códigos de
            recuperação em{" "}
            <Link href="/painel/perfil" className={linkTexto}>
              Perfil e recebimento
            </Link>
            .
          </p>
        </section>
      )}

      <SairDeTodos />
    </>
  );
}
