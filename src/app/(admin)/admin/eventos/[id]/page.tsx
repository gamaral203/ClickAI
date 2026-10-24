import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, Filter } from "lucide-react";
import { z } from "zod";

import { FotosDaGestao } from "@/components/admin/originais-da-gestao";
import { BuscaNoEvento } from "@/components/galeria/busca-no-evento";
import { Paginacao } from "@/components/galeria/paginacao";
import { StatusEventoSelo } from "@/components/painel/status-evento";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { buscarEventoPublicado, eventoDaGestao, listarFotosDaGestao } from "@/dados";
import { formatarDataCurta } from "@/lib/formatar";
import { limitarPagina } from "@/lib/galeria";
import { lerPagina } from "@/lib/validacao";
import { lerFiltroFotosDaGestao } from "@/servicos/originais-da-gestao";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Evento (gestão)",
  robots: { index: false, follow: false },
};

/** Fotos por página: fecha a grade em 2, 3, 4 e 6 colunas. */
const POR_PAGINA = 48;

type Busca = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default function PaginaEventoDaGestao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/eventos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Todos os eventos
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  const { id } = await params;
  const usuario = await exigirGestor(`/admin/eventos/${encodeURIComponent(id)}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const evento = await eventoDaGestao(id);
  if (!evento) notFound();

  const busca = await searchParams;
  const filtro = lerFiltroFotosDaGestao({
    pastaId: primeiro(busca.pasta) || undefined,
    autorId: primeiro(busca.autor) || undefined,
    excluidas: primeiro(busca.excluidas) === "1",
  });
  const pedida = lerPagina(busca.pagina);
  const [primeiraLeitura, doEvento, publico] = await Promise.all([
    listarFotosDaGestao(id, filtro, pedida, POR_PAGINA),
    listarFotosDaGestao(id, { excluidas: filtro.excluidas }, 1, 1),
    // A busca por selfie é a mesma do cliente (/api/busca-facial): só funciona com a galeria
    // pública aberta, e mostra só o que o cliente veria (prévias com marca d'água).
    buscarEventoPublicado(evento.slug),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(primeiraLeitura.total / POR_PAGINA));
  const pagina = limitarPagina(pedida, totalPaginas);
  const { fotos, total, bytes } =
    pagina === pedida ? primeiraLeitura : await listarFotosDaGestao(id, filtro, pagina, POR_PAGINA);

  const query = new URLSearchParams();
  if (filtro.pastaId) query.set("pasta", filtro.pastaId);
  if (filtro.autorId) query.set("autor", filtro.autorId);
  if (filtro.excluidas) query.set("excluidas", "1");
  const endereco = `/admin/eventos/${id}${query.size ? `?${query}` : ""}`;
  const filtrando = Boolean(filtro.pastaId || filtro.autorId);
  const caminhoDasPastas = Object.fromEntries(evento.pastas.map((p) => [p.id, p.caminho]));

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight break-words">{evento.titulo}</h1>
          <StatusEventoSelo status={evento.status} />
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Fotógrafo dono:</dt>
            <dd className="font-medium">{evento.fotografoNome}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Data:</dt>
            <dd>{formatarDataCurta(evento.inicioEm)}</dd>
          </div>
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-muted-foreground">Local:</dt>
            <dd className="min-w-0 break-words">
              {evento.local} · {evento.cidade} – {evento.estado}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Endereço:</dt>
            <dd className="break-all">/{evento.slug}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Fotos e vídeos:</dt>
            <dd className="tabular-nums">
              {evento.totalFotos}
              {evento.totalExcluidas > 0 && ` (+${evento.totalExcluidas} excluídas)`}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Vendidas:</dt>
            <dd className="tabular-nums">{evento.totalVendidas}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/eventos/${evento.slug}`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            Ver página pública
            <ExternalLink aria-hidden="true" data-icon="inline-end" />
          </Link>
          <Link
            href={`/fotografo/${evento.fotografoSlug}`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            Perfil do fotógrafo
            <ExternalLink aria-hidden="true" data-icon="inline-end" />
          </Link>
        </div>
      </header>

      {publico?.situacaoGaleria.tipo === "aberta" ? (
        // Mesmo componente e mesma rota da página pública do evento: a selfie vai só ao
        // reconhecimento, durante a busca, e nunca é gravada. A gestão não compra
        // (`podeComprar` falso, como na página pública para o gestor).
        <BuscaNoEvento
          slug={publico.slug}
          tituloEvento={publico.titulo}
          temNumeros={false}
          podeComprar={false}
          precoFotoCentavos={publico.precoFotoCentavos}
          previaDesfocada={Boolean(publico.previaDesfocada)}
        />
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          A busca por selfie é a mesma dos clientes e aparece aqui quando a galeria pública do
          evento está aberta (evento publicado, com fotos liberadas
          {evento.visibilidade === "senha" ? " e a senha do evento digitada neste navegador" : ""}).
        </p>
      )}

      <form
        method="get"
        action={`/admin/eventos/${id}`}
        aria-label="Filtrar as fotos do evento"
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_auto]"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-pasta">Pasta</Label>
          <select
            id="filtro-pasta"
            name="pasta"
            defaultValue={filtro.pastaId ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="">Todas as pastas</option>
            <option value="sem">Sem pasta</option>
            {evento.pastas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nivel === 2 ? `   └ ${p.nome}` : `${p.nome} (com subpastas)`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-autor">Autor</Label>
          <select
            id="filtro-autor"
            name="autor"
            defaultValue={filtro.autorId ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="">Todos os autores</option>
            {evento.autores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
                {a.dono ? " (dono)" : " (colaborador)"}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            name="excluidas"
            value="1"
            defaultChecked={filtro.excluidas}
            className="size-4 accent-primary"
          />
          Mostrar excluídas
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" size="touch">
            <Filter aria-hidden="true" data-icon="inline-start" />
            Filtrar
          </Button>
          {query.size > 0 && (
            <Link
              href={`/admin/eventos/${id}`}
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              Limpar filtros
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? "Nenhuma foto ou vídeo pronto com esses filtros."
          : `${total} ${total === 1 ? "arquivo" : "arquivos"}${
              query.size ? " com esses filtros" : ""
            }. As miniaturas são as prévias com marca d'água.`}
      </p>

      <Paginacao
        endereco={endereco}
        pagina={pagina}
        totalPaginas={totalPaginas}
        rotulo="Páginas (topo)"
      />
      <FotosDaGestao
        // A seleção recomeça a cada filtro.
        key={endereco}
        eventoId={id}
        eventoSlug={evento.slug}
        fotos={fotos}
        filtro={filtro}
        filtrando={filtrando}
        resumoFiltro={{ quantidade: total, bytes }}
        resumoEvento={{ quantidade: doEvento.total, bytes: doEvento.bytes }}
        caminhoDasPastas={caminhoDasPastas}
        pedeCodigo={usuario.mfaAtivo}
      />
      <Paginacao endereco={endereco} pagina={pagina} totalPaginas={totalPaginas} />
    </>
  );
}
