import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";

import { BotaoNotificacoes } from "@/components/notificacoes/botao-notificacoes";
import { listarConversasSuporte } from "@/dados";
import { formatarDataEHora } from "@/lib/formatar";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Chat de ajuda",
  robots: { index: false, follow: false },
};

export default function PaginaSuporte() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Chat de ajuda</h1>
        <p className="text-muted-foreground">
          Conversas dos fotógrafos pelo chat do painel. A resposta chega para eles no chat, por
          notificação e por e-mail.
        </p>
      </div>
      <BotaoNotificacoes contexto="mensagens do chat" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conversas />
      </Suspense>
    </div>
  );
}

async function Conversas() {
  await exigirGestor("/admin/suporte");
  const conversas = await listarConversasSuporte();
  if (conversas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Nenhuma conversa ainda.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {conversas.map((c) => (
        <li key={c.id}>
          <Link
            href={`/admin/suporte/${c.id}`}
            className="flex items-start gap-3 p-4 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
          >
            <span className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <MessageCircle aria-hidden="true" className="size-5" />
              {c.naoLidaPelaEquipe && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-destructive ring-2 ring-background"
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2">
                <span className={c.naoLidaPelaEquipe ? "font-bold" : "font-medium"}>{c.nome}</span>
                <span className="text-sm text-muted-foreground">{c.email}</span>
                {c.naoLidaPelaEquipe && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    Esperando resposta
                  </span>
                )}
              </span>
              {c.ultima && (
                <span className="truncate text-sm text-muted-foreground">
                  {c.ultima.autor === "equipe" ? "Você: " : ""}
                  {c.ultima.texto}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatarDataEHora(c.atualizadoEm)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
