import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { RespostaSuporte } from "@/components/suporte/resposta-suporte";
import { abrirConversaNaGestao } from "@/dados";
import { formatarDataEHora } from "@/lib/formatar";
import { ehIdValido } from "@/lib/validacao";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Conversa", robots: { index: false, follow: false } };

export default function PaginaConversa({ params }: PageProps<"/admin/suporte/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/suporte"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Todas as conversas
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conversa params={params} />
      </Suspense>
    </div>
  );
}

async function Conversa({ params }: { params: PageProps<"/admin/suporte/[id]">["params"] }) {
  const { id } = await params;
  await exigirGestor(`/admin/suporte/${id}`);
  const aberta = ehIdValido(id) ? await abrirConversaNaGestao(id) : null;
  if (!aberta) notFound();
  const { conversa, mensagens } = aberta;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{conversa.nome}</h1>
        <p className="text-sm text-muted-foreground">
          <a href={`mailto:${conversa.email}`} className="hover:underline">
            {conversa.email}
          </a>{" "}
          · conversa aberta em {formatarDataEHora(conversa.criadoEm)}
        </p>
      </div>
      <ol className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
        {mensagens.map((m) => {
          const equipe = m.autor === "equipe";
          return (
            <li
              key={m.id}
              className={`flex flex-col gap-1 ${equipe ? "items-end" : "items-start"}`}
            >
              <span className="px-2 text-xs text-muted-foreground">
                {equipe ? "Equipe" : conversa.nome} · {formatarDataEHora(m.criadoEm)}
              </span>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm break-words whitespace-pre-line ${
                  equipe
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-background shadow-xs ring-1 ring-border"
                }`}
              >
                {m.texto}
              </p>
            </li>
          );
        })}
      </ol>
      <RespostaSuporte conversaId={conversa.id} />
    </>
  );
}
