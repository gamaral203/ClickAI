import type { Metadata } from "next";
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
import { PreviaComLupa } from "@/components/galeria/previa-com-lupa";
import { SemMenuDeContexto } from "@/components/galeria/sem-menu-de-contexto";
import { RegistrarVisita } from "@/components/metricas/registrar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { autoresPorId, buscarFotoPublica } from "@/dados";
import { formatarPeriodo, formatarPreco } from "@/lib/formatar";
import { enderecoDaGaleria } from "@/lib/galeria";
import { podeComprar } from "@/lib/navegacao";
import { ehIdValido } from "@/lib/validacao";
import { limiteDoIpAtingido } from "@/servicos/limites";
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
    description: `Foto de ${dados.evento.titulo}, ${formatarPeriodo(dados.evento.inicioEm, dados.evento.fimEm)}, ${dados.evento.cidade}.`,
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
  // Contra a raspagem em massa das prévias (src/servicos/limites.ts, foto_ip).
  if (ehIdValido(id) && (await limiteDoIpAtingido("foto_ip"))) {
    return (
      <div role="status" className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">Muitas fotos abertas em pouco tempo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Espere alguns minutos e recarregue a página.
        </p>
      </div>
    );
  }
  const dados = await carregar(id);
  if (!dados) notFound();
  const { foto, evento, precoCentavos, posicao, paginaNaGaleria, anteriorId, proximaId } = dados;
  // Crédito ao autor: quem fez a foto, que pode não ser o dono do evento (evento colaborativo).
  // Quem vende vê a página como o cliente, mas sem o botão de compra (conta de fotógrafo não compra).
  const [autores, usuario] = await Promise.all([autoresPorId([foto.enviadaPor]), usuarioAtual()]);
  const autor = autores.get(foto.enviadaPor);
  const descricao = posicao ? `Foto ${posicao} de ${evento.titulo}` : `Foto de ${evento.titulo}`;

  return (
    // No celular, espaço embaixo para a barra fixa de compra não cobrir o fim da página.
    <div className="flex flex-col gap-4 pb-24 lg:gap-6 lg:pb-0">
      <RegistrarVisita fotoId={foto.id} />
      {/* Veio da galeria: volta no histórico, no mesmo ponto; senão, abre a página da galeria. */}
      <VoltarParaGaleria
        slug={evento.slug}
        fotoId={foto.id}
        href={enderecoDaGaleria(
          evento.slug,
          {},
          { pagina: paginaNaGaleria, ancora: `foto-${foto.id}` },
        )}
        className="inline-flex h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para {evento.titulo}
      </VoltarParaGaleria>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <figure className="flex flex-col gap-3">
          <SemMenuDeContexto
            className="relative mx-auto w-full overflow-hidden rounded-xl bg-muted"
            style={{ aspectRatio: `${foto.largura} / ${foto.altura}`, maxHeight: "78svh" }}
          >
            {foto.tipo === "video" && foto.previaVideo ? (
              // Vídeo: a prévia inteira, com a marca d'água em todos os quadros.
              <video
                src={foto.previaVideo}
                poster={foto.urlPrevia}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                aria-label={`Prévia do vídeo de ${evento.titulo}`}
                className="absolute inset-0 size-full bg-black object-contain"
              />
            ) : evento.previaDesfocada ? (
              // Opção do evento: desfocada, com o círculo de revelação (o mesmo do visualizador
              // da galeria); nunca a prévia inteira nítida.
              <PreviaComLupa
                id={foto.id}
                urlPrevia={foto.urlPrevia}
                urlPreviaCelular={foto.urlPreviaCelular ?? null}
                urlMiniatura={foto.urlMiniatura}
                descricao={descricao}
              />
            ) : (
              <PreviaNitida
                urlPrevia={foto.urlPrevia}
                urlPreviaCelular={foto.urlPreviaCelular ?? null}
                descricao={descricao}
              />
            )}
            {/* Quem fez a foto, no canto superior esquerdo (eventos com vários fotógrafos); embaixo
                fica a dica da lupa. */}
            <span className="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[80%] items-center gap-1.5 truncate rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Camera aria-hidden="true" className="size-3.5 shrink-0" />
              {autor?.nome ?? evento.fotografo.nomePublico}
            </span>
          </SemMenuDeContexto>
          <figcaption className="text-xs text-muted-foreground sm:text-sm">
            {foto.tipo === "video"
              ? "Prévia do vídeo inteiro com marca d'água. O original sai sem marca, no tamanho enviado."
              : evento.previaDesfocada
                ? "Prévia desfocada e com marca d'água. Comprando, você recebe a foto inteira, em alta resolução e sem marca."
                : "Prévia com marca d'água. O original sai sem marca e em alta resolução."}
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
              {formatarPeriodo(evento.inicioEm, evento.fimEm)} · {evento.cidade}, {evento.estado}
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

          {/* No celular o comprar fica na barra fixa de baixo; aqui, do computador em diante. */}
          <div className="hidden flex-col gap-4 rounded-xl border bg-card p-5 lg:flex">
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

          {/* Barra fixa de compra no celular: o preço e o botão sempre à mão, sem cobrir a foto
              (a página tem espaço embaixo para ela). */}
          <div
            data-barra-compra
            className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
          >
            <div className="mx-auto flex max-w-xl items-center gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground">Original sem marca</span>
                <span className="text-xl font-bold">{formatarPreco(precoCentavos)}</span>
              </div>
              <div className="min-w-0 flex-1">
                {podeComprar(usuario) ? (
                  <BotaoAdicionar fotoId={foto.id} />
                ) : (
                  <AvisoVendoComoFotografo />
                )}
              </div>
            </div>
          </div>

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

/**
 * Prévia nítida com a marca d'água (evento sem a prévia desfocada). No celular vai a versão de
 * 1000 px (urlPreviaCelular), quando existe; as imagens não passam pelo otimizador (next.config),
 * então a troca é por <picture>, que só baixa a versão da tela.
 */
function PreviaNitida({
  urlPrevia,
  urlPreviaCelular,
  descricao,
}: {
  urlPrevia: string;
  urlPreviaCelular: string | null;
  descricao: string;
}) {
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={urlPrevia} />
      <img
        src={urlPreviaCelular ?? urlPrevia}
        alt={descricao}
        draggable={false}
        fetchPriority="high"
        className="absolute inset-0 size-full object-contain imagem-protegida"
      />
    </picture>
  );
}
