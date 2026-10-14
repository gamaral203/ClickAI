import type { Metadata } from "next";
import { Suspense } from "react";

import { ChavesDoLightroom } from "@/components/painel/chaves-do-lightroom";
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
