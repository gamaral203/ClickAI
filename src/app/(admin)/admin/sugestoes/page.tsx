import type { Metadata } from "next";
import { Suspense } from "react";

import { StatusDaSugestao } from "@/components/suporte/status-da-sugestao";
import { listarSugestoes } from "@/dados";
import { formatarDataEHora } from "@/lib/formatar";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Sugestões", robots: { index: false, follow: false } };

export default function PaginaSugestoes() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Sugestões</h1>
        <p className="text-muted-foreground">
          Ideias de melhoria mandadas pelos fotógrafos pelo foguete do painel.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Lista />
      </Suspense>
    </div>
  );
}

async function Lista() {
  await exigirGestor("/admin/sugestoes");
  const sugestoes = await listarSugestoes();
  if (sugestoes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Nenhuma sugestão ainda.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {sugestoes.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{s.nome}</span>
              {s.email && ` · ${s.email}`} · {formatarDataEHora(s.criadoEm)}
            </p>
            <p className="break-words whitespace-pre-line">{s.texto}</p>
          </div>
          <StatusDaSugestao id={s.id} status={s.status} />
        </li>
      ))}
    </ul>
  );
}
