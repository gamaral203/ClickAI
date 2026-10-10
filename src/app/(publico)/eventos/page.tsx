import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CartaoEvento } from "@/components/galeria/cartao-evento";
import { FiltrosEventos } from "@/components/galeria/filtros-eventos";
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

  return (
    <>
      <FiltrosEventos action="/eventos" filtro={filtro} opcoes={opcoes} limpar="/eventos" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <p role="status">
          {eventos.length === 1 ? "1 evento encontrado" : `${eventos.length} eventos encontrados`}
        </p>
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
