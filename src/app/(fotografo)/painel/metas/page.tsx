import type { Metadata } from "next";
import { Suspense } from "react";
import { Trophy } from "lucide-react";

import { FotoComSelo } from "@/components/metas/foto-com-selo";
import { QuadroMeta } from "@/components/metas/quadro-meta";
import { SeloMeta } from "@/components/metas/selo-meta";
import { totalVendidoComoAutor } from "@/dados";
import { avatarDoFotografo, urlDoAvatar } from "@/lib/avatares";
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
  const ultima = metas.conquistadas.at(-1);
  // Prévia do selo: o da última meta batida ou, antes da primeira, o de 10K.
  const seloDaPrevia = ultima?.rotulo ?? METAS[0].rotulo;

  return (
    <>
      <SeloMeta metas={metas} />
      <p className="flex items-center gap-2 rounded-xl bg-accent p-4 text-accent-foreground">
        <Trophy aria-hidden="true" className="size-5 shrink-0" />
        {metas.proxima
          ? `Faltam ${formatarPreco(metas.faltaCentavos)} para o quadro de ${metas.proxima.rotulo}.`
          : "Você bateu todas as metas. Parabéns!"}
      </p>
      <section className="flex flex-col items-center gap-4 rounded-xl border p-6 text-center sm:flex-row sm:text-left">
        <FotoComSelo
          foto={urlDoAvatar(conta)}
          alt={conta.fotoPerfil ? `Foto de ${conta.nomePublico}` : avatarDoFotografo(conta).nome}
          rotulo={seloDaPrevia}
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {ultima ? "Seu selo no perfil" : "O selo que aparece no seu perfil"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ultima
              ? `Quem abre a sua página vê a moldura dourada com o selo de ${ultima.rotulo}. A cada nova meta, o selo muda.`
              : "Quando você bater a primeira meta, a sua foto de perfil ganha esta moldura dourada com o selo, na sua página e na sua loja. A cada nova meta, o selo muda."}
          </p>
        </div>
      </section>
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
