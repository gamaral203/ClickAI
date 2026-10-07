import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Circle } from "lucide-react";

import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default function PaginaPainel() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const { usuario, conta } = await exigirFotografo();
  const passos = [
    { feito: true, texto: "Criar a conta de fotógrafo" },
    { feito: usuario.emailConfirmado, texto: "Confirmar o e-mail", href: "/minhas-compras" },
    { feito: Boolean(conta.cpfCnpj), texto: "Informar CPF ou CNPJ", href: "/painel/perfil" },
    {
      feito: Boolean(conta.contaRecebimentoId),
      texto: "Conectar a conta de recebimento",
      href: "/painel/perfil",
    },
  ];
  const pronto = passos.every((p) => p.feito);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Olá, {conta.nomePublico}</h1>
      <section className="flex flex-col gap-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">
          {pronto ? "Tudo pronto para vender" : "Antes de publicar seu primeiro evento"}
        </h2>
        <ul className="flex flex-col gap-3">
          {passos.map((passo) => (
            <li key={passo.texto} className="flex items-center gap-3">
              {passo.feito ? (
                <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
              ) : (
                <Circle aria-hidden="true" className="size-5 text-muted-foreground" />
              )}
              <span className={passo.feito ? "text-muted-foreground line-through" : undefined}>
                {passo.texto}
              </span>
              <span className="sr-only">{passo.feito ? "(feito)" : "(pendente)"}</span>
              {!passo.feito && passo.href && (
                <Link
                  href={passo.href}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Fazer agora
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Crie seus eventos em Meus eventos.</p>
      </section>
    </div>
  );
}
