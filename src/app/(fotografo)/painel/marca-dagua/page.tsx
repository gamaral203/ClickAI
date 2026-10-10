import type { Metadata } from "next";
import { Suspense } from "react";

import { EscolhaDaMarca } from "@/components/painel/escolha-da-marca";
import { MODELO_MARCA_PADRAO } from "@/lib/marca-dagua";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Marca d'água",
  robots: { index: false, follow: false },
};

export default function PaginaMarcaDagua() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Marca d&apos;água</h1>
        <p className="text-muted-foreground">
          Escolha como a marca aparece nas prévias das suas fotos, dos modelos mais discretos aos
          mais protegidos. Quem compra recebe a foto original, sem marca.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/marca-dagua");
  return <EscolhaDaMarca atual={conta.modeloMarca ?? MODELO_MARCA_PADRAO} />;
}
