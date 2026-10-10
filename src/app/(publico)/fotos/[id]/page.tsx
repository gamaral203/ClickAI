import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  ShieldCheck,
} from "lucide-react";

import { AvisoVendoComoFotografo } from "@/components/carrinho/aviso-vendo-como-fotografo";
import { BotaoAdicionar } from "@/components/carrinho/botao-adicionar";
import { LinkOutraFoto, VoltarParaGaleria } from "@/components/galeria/navegacao-da-foto";
import { RegistrarVisita } from "@/components/metricas/registrar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { autoresPorId, buscarFotoPublica } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";
import { podeComprar } from "@/lib/navegacao";
import { ehIdValido } from "@/lib/validacao";
import { usuarioAtual } from "@/servicos/sessao";

async function carregar(id: string) {
  return ehIdValido(id) ? buscarFotoPublica(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/fotos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const dados = await carregar(id);
  if (!dados) return { title: "Foto não encontrada" };
  return {
    title: dados.posicao ? `Foto ${dados.posicao} — ${dados.evento.titulo}` : dados.evento.titulo,
    description: `Foto de ${dados.evento.titulo}, ${formatarData(dados.evento.inicioEm)}, ${dados.evento.cidade}.`,
    // Só indexa foto de evento público com galeria aberta; as outras só abrem pelo link.
    robots:
      dados.evento.visibilidade === "publico" && dados.evento.situacaoGaleria.tipo === "aberta"
        ? undefined
        : { index: false, follow: false },
  };
}

export default function PaginaFoto({ params }: PageProps<"/fotos/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<EsqueletoFoto />}>
        <ConteudoFoto params={params} />
      </Suspense>
    </div>
  );
}

async function ConteudoFoto({ params }: Pick<PageProps<"/fotos/[id]">, "params">) {
  const { id } = await params;
  const dados = await carregar(id);
  if (!dados) notFound();
  const { foto, evento, precoCentavos, posicao, anteriorId, proximaId } = dados;
  // Crédito ao autor: quem fez a foto, que pode não ser o dono do evento (evento colaborativo).
  // Quem vende vê a página como o cliente, mas sem o botão de compra (conta de fotógrafo não compra).
  const [autores, usuario] = await Promise.all([autoresPorId([foto.enviadaPor]), usuarioAtual()]);
  const autor = autores.get(foto.enviadaPor);
  const descricao = posicao ? `Foto ${posicao} de ${evento.titulo}` : `Foto de ${evento.titulo}`;

  return (
    <div className="flex flex-col gap-6">
      <RegistrarVisita fotoId={foto.id} />
      {/* Veio da galeria: volta no histórico, no mesmo ponto; link direto: abre a galeria. */}
      <VoltarParaGaleria
        slug={evento.slug}
        fotoId={foto.id}
        className="inline-flex h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para {evento.titulo}
      </VoltarParaGaleria>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <figure className="flex flex-col gap-3">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-xl bg-muted"
            style={{ aspectRatio: `${foto.largura} / ${foto.altura}`, maxHeight: "75vh" }}
          >
            <Image
              src={foto.urlPrevia}
              alt={descricao}
              fill
              loading="eager"
              sizes="(min-width: 1024px) 800px, 100vw"
              className="object-contain"
            />
            {/* Quem fez a foto, no canto inferior esquerdo (eventos com vários fotógrafos). */}
            <span className="absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1.5 truncate rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Camera aria-hidden="true" className="size-3.5 shrink-0" />
              {autor?.nome ?? evento.fotografo.nomePublico}
            </span>
          </div>
          <figcaption className="text-sm text-muted-foreground">
            Prévia com marca d&apos;água. O original sai sem marca e em alta resolução.
          </figcaption>
        </figure>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            {posicao && (
              <p className="text-sm text-muted-foreground">
                Foto {posicao} de {evento.totalItens}
              </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-balance">{evento.titulo}</h1>
            <p className="text-muted-foreground">
              {formatarData(evento.inicioEm)} · {evento.cidade}, {evento.estado}
            </p>
            <p className="text-muted-foreground">
              Foto por{" "}
              <Link
                href={`/fotografo/${autor?.slug ?? evento.fotografo.slug}`}
                className="font-medium text-foreground hover:underline"
              >
                {autor?.nome ?? evento.fotografo.nomePublico}
              </Link>
              {autor && autor.slug !== evento.fotografo.slug && (
                <> · evento de {evento.fotografo.nomePublico}</>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <p className="text-3xl font-bold">{formatarPreco(precoCentavos)}</p>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Download aria-hidden="true" className="size-4 shrink-0" />
                Original em alta resolução, sem marca d&apos;água
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
                Pagamento por Pix ou cartão
              </li>
            </ul>
            {podeComprar(usuario) ? (
              <BotaoAdicionar fotoId={foto.id} />
            ) : (
              <AvisoVendoComoFotografo />
            )}
          </div>

          {posicao && (
            <nav aria-label="Navegar entre as fotos do evento" className="flex gap-3">
              {anteriorId ? (
                <LinkOutraFoto
                  slug={evento.slug}
                  de={foto.id}
                  para={anteriorId}
                  className={cn(buttonVariants({ variant: "outline", size: "touch" }), "flex-1")}
                >
                  <ChevronLeft aria-hidden="true" data-icon="inline-start" />
                  Anterior
                </LinkOutraFoto>
              ) : (
                <span className="flex-1" />
              )}
              {proximaId && (
                <LinkOutraFoto
                  slug={evento.slug}
                  de={foto.id}
                  para={proximaId}
                  className={cn(buttonVariants({ variant: "outline", size: "touch" }), "flex-1")}
                >
                  Próxima
                  <ChevronRight aria-hidden="true" data-icon="inline-end" />
                </LinkOutraFoto>
              )}
            </nav>
          )}

          <Link
            href={`/denunciar?evento=${evento.slug}&foto=${foto.id}`}
            className="inline-flex h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Flag aria-hidden="true" className="size-4" />
            Denunciar esta foto ou pedir remoção
          </Link>
        </aside>
      </div>
    </div>
  );
}

function EsqueletoFoto() {
  return (
    <div aria-hidden="true" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="aspect-[3/2] animate-pulse rounded-xl bg-muted" />
      <div className="flex flex-col gap-4">
        <div className="h-8 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
