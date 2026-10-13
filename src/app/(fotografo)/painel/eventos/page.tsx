import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CirclePlus } from "lucide-react";

import { ListaMeusEventos } from "@/components/painel/lista-meus-eventos";
import { buttonVariants } from "@/components/ui/button";
import { horaDaRequisicao, listarMeusEventos } from "@/dados";
import { motivoDaCapaForaDoSite } from "@/lib/capa";
import { urlDoSite } from "@/lib/endereco";
import { formatarData } from "@/lib/formatar";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Meus eventos",
  robots: { index: false, follow: false },
};

export default function PaginaEventosDoPainel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Painel do fotógrafo
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Meus eventos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie, acompanhe e impulsione suas vendas.
          </p>
        </div>
        <Link
          href="/painel/eventos/novo"
          className={buttonVariants({ size: "touch", className: "rounded-xl" })}
        >
          <CirclePlus aria-hidden="true" data-icon="inline-start" />
          Novo evento
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Lista />
      </Suspense>
    </div>
  );
}

async function Lista() {
  const { conta } = await exigirFotografo("/painel/eventos");
  const eventos = await listarMeusEventos(conta.id, await horaDaRequisicao());

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <p className="text-lg font-semibold">Você ainda não criou eventos</p>
        <p className="text-sm text-muted-foreground">
          Crie o evento, envie as fotos e publique quando estiver tudo pronto.
        </p>
      </div>
    );
  }

  return (
    <ListaMeusEventos
      eventos={eventos.map((e, posicao) => ({
        id: e.id,
        slug: e.slug,
        titulo: e.titulo,
        status: e.status,
        cidade: e.cidade,
        estado: e.estado,
        local: e.local,
        quando: formatarData(e.inicioEm),
        inicioEm: e.inicioEm,
        posicao,
        categoria: e.categoria.nome,
        capa: e.capaMiniatura?.urlMiniatura ?? null,
        processando: e.processando,
        totalItens: e.totalItens,
        vendidos: e.vendidos,
        vendidoCentavos: e.vendidoCentavos,
        donoNome: e.colaboracao?.donoNome ?? null,
        // Só para o dono: no evento colaborado a capa do cartão já é a pública.
        avisoCapa:
          (!e.colaboracao &&
            e.capaMiniatura &&
            motivoDaCapaForaDoSite({ ...e, capaEnviada: e.capa !== null })) ||
          null,
        urlPublica: urlDoSite(`/eventos/${e.slug}`),
      }))}
    />
  );
}
