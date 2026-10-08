import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";

import { EnvioFotos } from "@/components/painel/envio-fotos";
import { StatusEventoSelo } from "@/components/painel/status-evento";
import { listarColaboracoes } from "@/dados";
import { formatarData } from "@/lib/formatar";
import { modoEnvio } from "@/lib/r2";
import { exigirFotografo } from "@/servicos/sessao";

// As Server Actions do envio de fotos rodam nesta página: a confirmação baixa o original do R2,
// gera prévia e miniatura e grava de volta, uma foto por chamada (docs/arquitetura.md, "Upload").
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Colaborações",
  robots: { index: false, follow: false },
};

export default function PaginaColaboracoes() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Colaborações</h1>
        <p className="text-muted-foreground">
          Eventos de outros fotógrafos em que você envia fotos. Você recebe pelas fotos que enviar,
          menos a comissão combinada com o dono do evento.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/colaboracoes");
  const colaboracoes = await listarColaboracoes(conta.id);
  const modo = modoEnvio();

  if (colaboracoes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Nenhum fotógrafo adicionou você como colaborador ainda. Para isso, ele usa o e-mail da sua
        conta, na página do evento dele.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-6">
      {colaboracoes.map((c) => (
        <li key={c.colaboradorId} className="flex flex-col gap-4 rounded-xl border p-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{c.evento.titulo}</h2>
              <StatusEventoSelo status={c.evento.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatarData(c.evento.inicioEm)} · de {c.donoNome} · comissão do dono{" "}
              {c.comissaoDonoPct}% · {c.meusItens} {c.meusItens === 1 ? "foto sua" : "fotos suas"}
            </p>
            {c.evento.status === "publicado" && (
              <Link
                href={`/eventos/${c.evento.slug}`}
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Ver a página pública
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
          <EnvioFotos eventoId={c.evento.id} modo={modo} />
        </li>
      ))}
    </ul>
  );
}
