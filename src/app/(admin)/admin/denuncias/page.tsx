import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Flag } from "lucide-react";

import { listarDenuncias, type StatusDenuncia } from "@/dados";
import { ROTULO_STATUS, rotuloDoMotivo } from "@/lib/denuncias";
import { formatarDataEHora } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Denúncias", robots: { index: false, follow: false } };

const FILTROS: { valor: StatusDenuncia | null; rotulo: string }[] = [
  { valor: null, rotulo: "Todas" },
  { valor: "recebida", rotulo: "Recebidas" },
  { valor: "em_analise", rotulo: "Em análise" },
  { valor: "procedente", rotulo: "Procedentes" },
  { valor: "improcedente", rotulo: "Improcedentes" },
];

export default function PaginaDenuncias({ searchParams }: PageProps<"/admin/denuncias">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Denúncias</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Pick<PageProps<"/admin/denuncias">, "searchParams">) {
  await exigirGestor("/admin/denuncias");
  const { status } = await searchParams;
  const filtro = FILTROS.find((f) => f.valor === status)?.valor ?? null;
  const denuncias = await listarDenuncias(filtro ?? undefined);

  return (
    <>
      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.rotulo}
            href={f.valor ? `/admin/denuncias?status=${f.valor}` : "/admin/denuncias"}
            aria-current={filtro === f.valor ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium",
              filtro === f.valor
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>
      {denuncias.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma denúncia {filtro ? "com este status" : "ainda"}.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {denuncias.map((d) => (
            <li key={d.id}>
              <Link
                href={`/admin/denuncias/${d.id}`}
                className="flex flex-col gap-1 rounded-xl border p-4 hover:bg-accent/40"
              >
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Flag aria-hidden="true" className="size-4" />
                  <span className="font-semibold">{ROTULO_STATUS[d.status]}</span>
                  <span className="text-muted-foreground">
                    · {d.alvoTipo === "foto" ? "Foto" : "Evento"} · {formatarDataEHora(d.criadoEm)}
                  </span>
                </span>
                <span className="font-medium">{d.evento.titulo}</span>
                <span className="text-sm text-muted-foreground">{rotuloDoMotivo(d.motivo)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
