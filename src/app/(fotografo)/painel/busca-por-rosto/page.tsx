import type { Metadata } from "next";
import { Suspense } from "react";

import { BuscaPorRosto } from "@/components/painel/busca-por-rosto";
import { eventosDaBuscaPorRosto } from "@/dados";
import { provedorFacial } from "@/lib/reconhecimento";
import { BUSCA_ROSTO_MAX_EVENTOS } from "@/servicos/busca-por-rosto";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Buscar por rosto",
  robots: { index: false, follow: false },
};

export default function PaginaBuscaPorRosto() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Buscar por rosto</h1>
        <p className="text-sm text-muted-foreground">
          Envie a foto de uma pessoa e encontre, entre as fotos dos seus eventos, aquelas em que ela
          aparece. Útil para mandar ao cliente o link das fotos dele.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/busca-por-rosto");
  const eventos = await eventosDaBuscaPorRosto(conta.id);
  return (
    <BuscaPorRosto
      eventos={eventos}
      maximoRecentes={BUSCA_ROSTO_MAX_EVENTOS}
      exemplo={provedorFacial() === "exemplo"}
    />
  );
}
