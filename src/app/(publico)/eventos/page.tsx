import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Search } from "lucide-react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarEventosPublicados, listarOpcoesFiltroEventos } from "@/dados";
import { destinoDaVitrine } from "@/lib/navegacao";
import { lerFiltroEventos } from "@/lib/validacao";
import { usuarioAtual } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Eventos",
  description: "Encontre o evento em que você estava e veja as fotos.",
};

// A página espera a sessão antes de qualquer conteúdo (para o redirecionamento sair como 307),
// então bloqueia no servidor em vez de gerar uma casca instantânea.
export const instant = false;

export default async function PaginaEventos({ searchParams }: PageProps<"/eventos">) {
  // A lista de eventos é a vitrine de quem compra: quem vende vai para os próprios eventos.
  const destino = destinoDaVitrine(await usuarioAtual(), "/eventos");
  if (destino) redirect(destino);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Eventos</h1>
      {/* searchParams só existe na requisição: o resto da página sai pronto do build. */}
      <Suspense fallback={<EsqueletoEventos />}>
        <EventosFiltrados searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Mesmo visual do <Input>, para os filtros funcionarem como formulário comum, sem JavaScript. */
const classeSelect =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

async function EventosFiltrados({
  searchParams,
}: {
  searchParams: PageProps<"/eventos">["searchParams"];
}) {
  const filtro = lerFiltroEventos(await searchParams);
  const [eventos, opcoes] = await Promise.all([
    listarEventosPublicados(filtro),
    listarOpcoesFiltroEventos(),
  ]);
  const filtrando = Boolean(filtro.busca || filtro.data || filtro.categoria || filtro.cidade);

  return (
    <>
      <form
        action="/eventos"
        role="search"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"
      >
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="busca">Nome do evento, cidade ou fotógrafo</Label>
          <Input
            id="busca"
            name="busca"
            type="search"
            maxLength={100}
            defaultValue={filtro.busca}
            placeholder="Ex.: corrida, formatura, Curitiba"
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="categoria">Categoria</Label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={filtro.categoria ?? ""}
            className={classeSelect}
          >
            <option value="">Todas</option>
            {opcoes.categorias.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cidade">Cidade</Label>
          <select
            id="cidade"
            name="cidade"
            defaultValue={filtro.cidade ?? ""}
            className={classeSelect}
          >
            <option value="">Todas</option>
            {opcoes.cidades.map((c) => (
              <option key={`${c.nome}-${c.estado}`} value={c.nome}>
                {c.nome} – {c.estado}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={filtro.data} className="h-11" />
        </div>
        <button type="submit" className={buttonVariants({ size: "touch" })}>
          <Search aria-hidden="true" data-icon="inline-start" />
          Buscar
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <p role="status">
          {eventos.length === 1 ? "1 evento encontrado" : `${eventos.length} eventos encontrados`}
        </p>
        {filtrando && (
          <Link
            href="/eventos"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Limpar busca
          </Link>
        )}
      </div>

      {eventos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex">
              <CartaoEvento evento={evento} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">Nenhum evento encontrado.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira a grafia ou tire algum dos filtros.
          </p>
        </div>
      )}
    </>
  );
}

function EsqueletoEventos() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="h-11 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
