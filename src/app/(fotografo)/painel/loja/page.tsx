import type { Metadata } from "next";
import { Suspense } from "react";

import { DominioProprio } from "@/components/painel/dominio-proprio";
import { FormularioLoja } from "@/components/painel/formulario-loja";
import { buscarLojaDoFotografo } from "@/dados";
import { enderecoDaLoja, enderecoDoSite } from "@/lib/endereco";
import { gerarSlug } from "@/lib/slug";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Minha loja", robots: { index: false, follow: false } };

export default function PaginaLoja() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Minha loja</h1>
        <p className="text-muted-foreground">
          Uma página só sua, com seu nome e suas cores, mostrando os seus eventos. Boa para divulgar
          no Instagram e no cartão de visita.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/loja");
  const loja = await buscarLojaDoFotografo(conta.id);
  const base = new URL(enderecoDoSite());

  return (
    <>
      <FormularioLoja
        enderecoBase={{ protocolo: base.protocol, host: base.host.replace(/^www\./, "") }}
        enderecoAtual={loja?.ativa ? enderecoDaLoja(loja.subdominio) : null}
        loja={{
          nome: loja?.nome ?? conta.nomePublico,
          descricao: loja?.descricao ?? "",
          subdominio: loja?.subdominio ?? gerarSlug(conta.nomePublico).slice(0, 32),
          // Sem loja ainda: começa com as cores da plataforma.
          corPrimaria: loja?.corPrimaria ?? "#2362FE",
          corSecundaria: loja?.corSecundaria ?? "#BCFA34",
          gaId: loja?.gaId ?? "",
          gtmId: loja?.gtmId ?? "",
          ativa: loja?.ativa ?? true,
        }}
      />
      <section className="flex flex-col gap-4 border-t pt-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Domínio próprio (opcional)</h2>
          <p className="text-sm text-muted-foreground">
            Use um endereço seu, como fotos.seusite.com.br, além do endereço do ClicouAí.
          </p>
        </div>
        <DominioProprio
          dominio={loja?.dominioProprio ?? null}
          verificado={loja?.dominioVerificado ?? false}
          temLoja={Boolean(loja)}
        />
      </section>
    </>
  );
}
