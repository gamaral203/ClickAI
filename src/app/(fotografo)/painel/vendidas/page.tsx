import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";

import { Paginacao } from "@/components/galeria/paginacao";
import { FotosVendidas } from "@/components/painel/fotos-vendidas";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eventosComVendidasDoAutor, listarVendidasDoAutor } from "@/dados";
import { limitarPagina } from "@/lib/galeria";
import { lerPagina } from "@/lib/validacao";
import { lerFiltroDasVendidas, resumoVendidasParaOAutor } from "@/servicos/originais-do-dono";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Fotos vendidas",
  robots: { index: false, follow: false },
};

/** Vendas por página: fecha a grade em 2, 3 e 4 colunas. */
const POR_PAGINA = 48;

type Busca = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default function PaginaVendidas({ searchParams }: { searchParams: Promise<Busca> }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Fotos vendidas</h1>
        <p className="text-sm text-muted-foreground">
          Todas as fotos que você enviou e foram vendidas, de qualquer evento, inclusive nos que
          você colabora. Aparecem sem marca d&apos;água, só para você, e você baixa os originais.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Busca> }) {
  const { usuario, conta } = await exigirFotografo("/painel/vendidas");
  const busca = await searchParams;
  const filtro = lerFiltroDasVendidas({
    eventoId: primeiro(busca.evento) || undefined,
    de: primeiro(busca.de) || undefined,
    ate: primeiro(busca.ate) || undefined,
    comprador: primeiro(busca.comprador) || undefined,
  });
  const pedida = lerPagina(busca.pagina);
  const [eventos, resumo, primeiraLeitura] = await Promise.all([
    eventosComVendidasDoAutor(conta.id),
    resumoVendidasParaOAutor(usuario, filtro),
    listarVendidasDoAutor(conta.id, filtro, pedida, POR_PAGINA),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(primeiraLeitura.total / POR_PAGINA));
  const pagina = limitarPagina(pedida, totalPaginas);
  // Página depois do fim (filtro mudou): mostra a última.
  const { vendas, total } =
    pagina === pedida
      ? primeiraLeitura
      : await listarVendidasDoAutor(conta.id, filtro, pagina, POR_PAGINA);

  const params = new URLSearchParams();
  if (filtro.eventoId) params.set("evento", filtro.eventoId);
  if (filtro.de) params.set("de", filtro.de);
  if (filtro.ate) params.set("ate", filtro.ate);
  if (filtro.comprador) params.set("comprador", filtro.comprador);
  const endereco = `/painel/vendidas${params.size ? `?${params}` : ""}`;
  const filtrando = params.size > 0;

  return (
    <>
      <form
        method="get"
        action="/painel/vendidas"
        role="search"
        aria-label="Filtrar as fotos vendidas"
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr]"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-evento">Evento</Label>
          <select
            id="filtro-evento"
            name="evento"
            defaultValue={filtro.eventoId ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="">Todos os eventos</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-de">Vendidas de</Label>
          <Input
            id="filtro-de"
            type="date"
            name="de"
            defaultValue={filtro.de ?? ""}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-ate">até</Label>
          <Input
            id="filtro-ate"
            type="date"
            name="ate"
            defaultValue={filtro.ate ?? ""}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-comprador">Comprador</Label>
          <Input
            id="filtro-comprador"
            type="search"
            name="comprador"
            maxLength={120}
            placeholder="Nome ou e-mail"
            defaultValue={filtro.comprador ?? ""}
            className="h-11"
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="touch">
            <Search aria-hidden="true" data-icon="inline-start" />
            Filtrar
          </Button>
          {filtrando && (
            <Link
              href="/painel/vendidas"
              className={buttonVariants({ variant: "outline", size: "touch" })}
            >
              Limpar filtros
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? filtrando
            ? "Nenhuma venda com esses filtros."
            : "Nenhuma foto sua foi vendida ainda. As vendas aparecem aqui assim que o pagamento é confirmado."
          : `${total} ${total === 1 ? "venda" : "vendas"} de ${resumo?.quantidade ?? 0} ${
              resumo?.quantidade === 1 ? "foto" : "fotos"
            }${filtrando ? " com esses filtros" : ""}, da mais recente para a mais antiga.`}
      </p>

      {total > 0 && (
        <>
          <Paginacao
            endereco={endereco}
            pagina={pagina}
            totalPaginas={totalPaginas}
            rotulo="Páginas (topo)"
          />
          <FotosVendidas
            // A seleção recomeça a cada filtro.
            key={endereco}
            vendas={vendas}
            filtro={filtro}
            resumo={resumo ?? { quantidade: 0, bytes: 0 }}
            pedeCodigo={usuario.mfaAtivo}
          />
          <Paginacao endereco={endereco} pagina={pagina} totalPaginas={totalPaginas} />
        </>
      )}
    </>
  );
}
