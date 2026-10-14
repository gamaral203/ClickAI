import type { Metadata } from "next";
import { Suspense } from "react";
import { Download } from "lucide-react";

import { ChavesDoLightroom } from "@/components/painel/chaves-do-lightroom";
import { buttonVariants } from "@/components/ui/button";
import { listarChavesApi } from "@/dados/chaves-api";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Lightroom",
  robots: { index: false, follow: false },
};

export default function PaginaLightroom() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Lightroom</h1>
        <p className="text-muted-foreground">
          Publique as fotos direto do Lightroom Classic nos seus eventos, sem passar pelo navegador.
          O plugin usa uma chave de acesso: gere uma aqui e cole no plugin.
        </p>
      </div>
      <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">1. Baixe e instale o plugin</h2>
          <p className="text-sm text-muted-foreground">
            Só no Lightroom Classic (o programa instalado no computador, Windows ou Mac). O
            Lightroom da web e do celular não aceitam plugins.
          </p>
        </div>
        <a
          href="/api/plugin/download"
          download
          className={buttonVariants({ size: "touch", className: "w-fit" })}
        >
          <Download aria-hidden="true" className="size-4" />
          Baixar o plugin
        </a>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          <li>Descompacte o .zip numa pasta que não vai mudar de lugar (ex.: Documentos).</li>
          <li>
            No Lightroom Classic:{" "}
            <strong>Arquivo &gt; Gerenciador de plug-ins &gt; Adicionar</strong>, escolha a pasta{" "}
            <strong>ClicouAi.lrplugin</strong> e clique em Concluído.
          </li>
          <li>
            Gere uma chave abaixo. No módulo Biblioteca, em{" "}
            <strong>Serviços de publicação &gt; ClicouAí &gt; Configurar</strong>, cole a chave,
            clique em <strong>Verificar e atualizar eventos</strong> e salve.
          </li>
          <li>
            Seus eventos viram coleções. Arraste as fotos editadas para o evento e clique em{" "}
            <strong>Publicar</strong>.
          </li>
        </ol>
      </section>
      <h2 className="-mb-2 text-lg font-semibold">2. Chave de acesso</h2>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/lightroom");
  const chaves = await listarChavesApi(conta.id);
  return <ChavesDoLightroom chaves={chaves} />;
}
