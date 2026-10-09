import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CabecalhoLoja } from "@/components/loja/cabecalho-loja";
import { numerosDoFotografo, VitrineDoFotografo } from "@/components/loja/vitrine-do-fotografo";
import {
  buscarFotografoPublico,
  buscarLojaDoFotografo,
  listarEventosPublicados,
  totalVendidoComoAutor,
} from "@/dados";
import { urlDoSite } from "@/lib/endereco";
import { corDoTexto } from "@/lib/loja";
import { situacaoDasMetas } from "@/lib/metas";
import { FORMATO_SLUG } from "@/lib/slug";

// Link do fotógrafo: /fotografo/<endereço>. Todo fotógrafo tem o seu, sem configurar nada, para
// divulgar o trabalho: quem entra vê só os eventos dele. (A loja própria, com nome, cores e
// domínio, continua opcional em Minha loja.)

async function carregar(params: PageProps<"/fotografo/[slug]">["params"]) {
  const { slug } = await params;
  return FORMATO_SLUG.test(slug) ? buscarFotografoPublico(slug) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/fotografo/[slug]">): Promise<Metadata> {
  const fotografo = await carregar(params);
  if (!fotografo) return { title: "Fotógrafo não encontrado" };
  return {
    title: fotografo.nomePublico,
    description: fotografo.bio ?? `Fotos dos eventos de ${fotografo.nomePublico} no ClicouAí.`,
  };
}

export default function PaginaFotografo({ params, searchParams }: PageProps<"/fotografo/[slug]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-muted" />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/fotografo/[slug]">) {
  const fotografo = await carregar(params);
  if (!fotografo) notFound();
  const { busca } = await searchParams;
  const termo = typeof busca === "string" ? busca.trim().slice(0, 100) : "";
  const [todos, encontrados, salva, vendido] = await Promise.all([
    listarEventosPublicados({ fotografoId: fotografo.id }),
    termo ? listarEventosPublicados({ fotografoId: fotografo.id, busca: termo }) : null,
    buscarLojaDoFotografo(fotografo.id),
    totalVendidoComoAutor(fotografo.id),
  ]);
  // Última meta de vendas batida: a foto de perfil ganha a moldura dourada com o selo.
  const conquista = situacaoDasMetas(vendido).conquistadas.at(-1)?.rotulo ?? null;
  // O que o fotógrafo configurou em Minha loja (nome, descrição e cores) vale aqui também.
  const loja = salva?.ativa ? salva : null;
  const corPrimaria = loja?.corPrimaria ?? "#2362FE";
  const corSecundaria = loja?.corSecundaria ?? "#BCFA34";

  return (
    <div
      className="flex flex-col"
      style={
        loja
          ? ({
              "--primary": corPrimaria,
              "--primary-foreground": corDoTexto(corPrimaria),
              "--ring": corPrimaria,
            } as React.CSSProperties)
          : undefined
      }
    >
      <CabecalhoLoja
        nome={loja?.nome ?? fotografo.nomePublico}
        descricao={loja?.descricao ?? fotografo.bio}
        capa={fotografo.capa}
        logo={fotografo.fotoPerfil}
        corPrimaria={corPrimaria}
        corSecundaria={corSecundaria}
        redes={fotografo.redesSociais}
        numeros={numerosDoFotografo(todos)}
        urlParaCompartilhar={urlDoSite(`/fotografo/${fotografo.slug}`)}
        conquista={conquista}
      />
      <VitrineDoFotografo
        eventos={encontrados ?? todos}
        busca={{
          termo,
          limpar: `/fotografo/${fotografo.slug}`,
          rotulo: `Buscar nos eventos de ${fotografo.nomePublico}`,
        }}
      />
    </div>
  );
}
