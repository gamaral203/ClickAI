import type { Metadata } from "next";
import { Suspense } from "react";

import { ProtecaoDasPrevias } from "@/components/admin/protecao-das-previas";
import { situacaoDaProtecao } from "@/servicos/protecao-previas";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Marca d'água e prévias",
  robots: { index: false, follow: false },
};

// As ações desta página incluem os lotes da regeração das prévias (até ~50 s cada).
export const maxDuration = 120;

export default function PaginaMarcaDagua() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Marca d&apos;água e prévias</h1>
        <p className="text-muted-foreground">
          Configuração da plataforma inteira: a marca gravada nas prévias, o tamanho e a qualidade
          delas. O fotógrafo continua escolhendo o modelo da marca; estes valores valem por baixo
          dele, com pisos que nenhum modelo desliga.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const gestor = await exigirGestor("/admin/marca-dagua");
  const situacao = await situacaoDaProtecao(gestor);
  return <ProtecaoDasPrevias situacao={situacao} />;
}
