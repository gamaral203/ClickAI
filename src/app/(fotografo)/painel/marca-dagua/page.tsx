import type { Metadata } from "next";
import { Suspense } from "react";

import { AbasDaMarca } from "@/components/painel/abas-da-marca";
import { AjustesDaMarca } from "@/components/painel/ajustes-da-marca";
import { EscolhaDaMarca } from "@/components/painel/escolha-da-marca";
import { PreviaDesfocadaPorEvento } from "@/components/painel/previa-desfocada-por-evento";
import { configuracaoDaMarca, eventosDaPreviaDesfocada } from "@/dados";
import { ajustesDaMarcaDaConta } from "@/dados/painel";
import { MODELO_MARCA_PADRAO } from "@/lib/marca-dagua";
import { aplicarAjustesDaMarca } from "@/lib/protecao-previas";
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
          Escolha como a marca aparece nas prévias das suas fotos, ajuste o tamanho e a força dela e
          ligue a prévia desfocada nos eventos que quiser. Quem compra recebe a foto original, sem
          marca.
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
  const [global, eventos] = await Promise.all([
    configuracaoDaMarca(),
    eventosDaPreviaDesfocada(conta.id),
  ]);
  const modelo = conta.modeloMarca ?? MODELO_MARCA_PADRAO;
  const ajustes = ajustesDaMarcaDaConta(conta);
  const salvos = ajustes ? aplicarAjustesDaMarca(global, ajustes) : null;
  const doConfig = (c: typeof global) => ({
    tamanhoPct: c.tamanhoPct,
    quantidade: c.quantidade,
    opacidadePct: c.opacidadePct,
    larguraPrevia: c.larguraPrevia,
    variacao: c.variacao,
  });
  const padrao = doConfig(global);
  const versao = salvos ? Object.values(doConfig(salvos)).join("-") : "padrao";
  return (
    // Um botão para cada parte: modelos, ajustes e prévia desfocada (src/components/painel/
    // abas-da-marca.tsx).
    <AbasDaMarca
      modelos={
        // A versão dos ajustes renova as amostras dos modelos quando eles mudam.
        <EscolhaDaMarca atual={modelo} versaoDosAjustes={versao} />
      }
      previa={<PreviaDesfocadaPorEvento eventos={eventos} />}
      ajustar={
        <AjustesDaMarca
          // Recomeça com os valores salvos quando eles mudam (salvar, voltar ao padrão).
          key={versao}
          modelo={modelo}
          padrao={padrao}
          salvos={salvos ? doConfig(salvos) : null}
        />
      }
    />
  );
}
