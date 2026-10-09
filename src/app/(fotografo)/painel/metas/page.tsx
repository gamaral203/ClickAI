import type { Metadata } from "next";
import { Suspense } from "react";
import { Trophy } from "lucide-react";

import { QuadroMeta } from "@/components/metas/quadro-meta";
import { SeloMeta } from "@/components/metas/selo-meta";
import { totalVendidoComoAutor } from "@/dados";
import { formatarPreco } from "@/lib/formatar";
import { METAS, situacaoDasMetas } from "@/lib/metas";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Metas", robots: { index: false, follow: false } };

export default function PaginaMetas() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Metas</h1>
        <p className="text-muted-foreground">
          A cada marca de vendas das suas fotos, você ganha um quadro do ClicouAí. Conta o que os
          clientes pagaram pelas fotos que você fez, em todos os eventos.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/metas");
  const metas = situacaoDasMetas(await totalVendidoComoAutor(conta.id));

  return (
    <>
      <SeloMeta metas={metas} />
      <p className="flex items-center gap-2 rounded-xl bg-accent p-4 text-accent-foreground">
        <Trophy aria-hidden="true" className="size-5 shrink-0" />
        {metas.proxima
          ? `Faltam ${formatarPreco(metas.faltaCentavos)} para o quadro de ${metas.proxima.rotulo}.`
          : "Você bateu todas as metas. Parabéns!"}
      </p>
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {METAS.map((meta) => (
          <li key={meta.rotulo}>
            <QuadroMeta
              meta={meta}
              conquistado={metas.totalCentavos >= meta.valorCentavos}
              faltaCentavos={Math.max(0, meta.valorCentavos - metas.totalCentavos)}
            />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        As premiações de cada meta serão anunciadas em breve. Só contam vendas pagas: estornos e
        chargebacks saem da conta.
      </p>
    </>
  );
}
