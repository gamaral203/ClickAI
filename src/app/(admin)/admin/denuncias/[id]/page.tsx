import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AcoesDenuncia } from "@/components/admin/acoes-denuncia";
import { buscarDenuncia } from "@/dados";
import { ROTULO_STATUS, rotuloDoMotivo } from "@/lib/denuncias";
import { formatarCpfCnpj } from "@/lib/documentos";
import { formatarDataEHora } from "@/lib/formatar";
import { ehIdValido } from "@/lib/validacao";
import { exigirEquipe } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Denúncia", robots: { index: false, follow: false } };

export default function PaginaDenuncia({ params }: PageProps<"/admin/denuncias/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/denuncias"
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Denúncias
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: Pick<PageProps<"/admin/denuncias/[id]">, "params">) {
  const usuario = await exigirEquipe("/admin/denuncias");
  const { id } = await params;
  const d = ehIdValido(id) ? await buscarDenuncia(id) : null;
  if (!d) notFound();
  const aberta = d.status === "recebida" || d.status === "em_analise";

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-primary">
          {ROTULO_STATUS[d.status]} · protocolo {d.id.slice(0, 8).toUpperCase()}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {d.alvoTipo === "foto" ? "Denúncia sobre uma foto de " : "Denúncia sobre o evento "}
          {d.evento.titulo}
        </h1>
        <p className="text-sm text-muted-foreground">
          Recebida em {formatarDataEHora(d.criadoEm)} · evento de {d.donoNome} · status do evento:{" "}
          {d.evento.status}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="flex flex-col gap-4 rounded-xl border p-5">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Motivo</h2>
            <p className="font-medium">{rotuloDoMotivo(d.motivo)}</p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Descrição</h2>
            <p className="whitespace-pre-line">{d.descricao}</p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Contato (só a equipe vê)</h2>
            <p>
              {d.contatoEmail}
              {d.contatoTelefone && ` · ${d.contatoTelefone}`}
            </p>
            {(d.razaoSocial || d.cnpj) && (
              <p className="text-sm text-muted-foreground">
                {d.razaoSocial}
                {d.cnpj && ` · CNPJ ${formatarCpfCnpj(d.cnpj)}`}
              </p>
            )}
          </div>
          <Link
            href={d.foto ? `/fotos/${d.foto.id}` : `/eventos/${d.evento.slug}`}
            target="_blank"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Ver {d.foto ? "a foto" : "o evento"} no site
            <ExternalLink aria-hidden="true" className="size-4" />
          </Link>
        </section>

        <aside className="flex flex-col gap-4">
          {d.foto && (
            <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
              <Image
                src={d.foto.urlMiniatura}
                alt="Foto denunciada"
                fill
                sizes="280px"
                className="object-cover"
              />
              {d.foto.excluida && (
                <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold">
                  Fora da galeria
                </span>
              )}
            </div>
          )}
          {aberta ? (
            usuario.papel === "admin" ? (
              <AcoesDenuncia
                id={d.id}
                status={d.status === "recebida" ? "recebida" : "em_analise"}
                alvoTipo={d.alvoTipo}
                eventoNoAr={d.evento.status === "publicado"}
              />
            ) : (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                Só o gestor decide denúncias. Você pode acompanhar por aqui.
              </p>
            )
          ) : (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Decidida. As partes já foram avisadas.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
