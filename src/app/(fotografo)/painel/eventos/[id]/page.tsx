import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";

import { AcoesEvento } from "@/components/painel/acoes-evento";
import { EnvioFotos } from "@/components/painel/envio-fotos";
import { GradeFotosPainel } from "@/components/painel/grade-fotos-painel";
import { FormularioEvento } from "@/components/painel/formulario-evento";
import { StatusEventoSelo } from "@/components/painel/status-evento";
import { buscarEventoDoFotografo, listarCategorias, listarItensDoPainel } from "@/dados";
import { isoParaCampo } from "@/lib/datas";
import { centavosParaCampo } from "@/lib/dinheiro";
import { formatarDataEHora } from "@/lib/formatar";
import { ehIdValido } from "@/lib/validacao";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Gerenciar evento",
  robots: { index: false, follow: false },
};

export default function PaginaGerenciarEvento(props: PageProps<"/painel/eventos/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/painel/eventos"
        className="inline-flex h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Meus eventos
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo {...props} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/painel/eventos/[id]">) {
  const { id } = await params;
  const { conta } = await exigirFotografo(`/painel/eventos/${id}`);
  // Evento de outro fotógrafo dá "não encontrado", igual a um id que não existe.
  const evento = ehIdValido(id) ? await buscarEventoDoFotografo(id, conta.id) : null;
  if (!evento) notFound();
  const { criado } = await searchParams;
  const categorias = await listarCategorias();
  const liberacaoManualPendente = evento.liberacao === "manual" && !evento.liberadoEm;
  const itens = (await listarItensDoPainel(evento.id, conta.id)) ?? [];

  return (
    <>
      {criado === "1" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Evento criado como rascunho. Envie as fotos e publique quando estiver pronto.
        </p>
      )}

      <header className="flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{evento.titulo}</h1>
          <StatusEventoSelo status={evento.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {evento.totalItens} {evento.totalItens === 1 ? "foto pronta" : "fotos prontas"} ·{" "}
          {evento.vendidos} {evento.vendidos === 1 ? "vendida" : "vendidas"}
          {evento.liberacao === "agendada" &&
            evento.liberadoEm &&
            ` · liberação em ${formatarDataEHora(evento.liberadoEm)}`}
          {liberacaoManualPendente && " · fotos ainda não liberadas"}
        </p>
        {evento.status === "publicado" && (
          <Link
            href={`/eventos/${evento.slug}`}
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Ver a página pública
            <ExternalLink aria-hidden="true" className="size-4" />
          </Link>
        )}
        <AcoesEvento
          eventoId={evento.id}
          status={evento.status}
          liberacaoManualPendente={liberacaoManualPendente}
        />
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Fotos ({itens.length})</h2>
        <EnvioFotos eventoId={evento.id} />
        <GradeFotosPainel
          itens={itens.map((i) => ({
            id: i.id,
            urlMiniatura: i.urlMiniatura,
            nomeArquivo: i.nomeArquivo,
            status: i.status,
            vendido: i.vendido,
          }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Configurações</h2>
        <FormularioEvento
          eventoId={evento.id}
          categorias={categorias}
          inicial={{
            titulo: evento.titulo,
            categoriaId: evento.categoriaId,
            inicioEm: isoParaCampo(evento.inicioEm),
            fimEm: isoParaCampo(evento.fimEm),
            local: evento.local,
            cidade: evento.cidade,
            estado: evento.estado,
            precoFoto: centavosParaCampo(evento.precoFotoCentavos),
            precoVideo: centavosParaCampo(evento.precoVideoCentavos),
            visibilidade: evento.visibilidade,
            temSenha: evento.temSenha,
            fotosSoAposBusca: evento.fotosSoAposBusca,
            liberacao: evento.liberacao,
            liberadoEm: evento.liberadoEm ? isoParaCampo(evento.liberadoEm) : "",
            filtroHorario: evento.filtroHorario,
            listarNaoIdentificadas: evento.listarNaoIdentificadas,
            ordenacao: evento.ordenacao,
          }}
        />
      </section>
    </>
  );
}
