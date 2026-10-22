import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Search } from "lucide-react";
import { z } from "zod";

import { Celula, Tabela } from "@/components/admin/tabela";
import { Paginacao } from "@/components/galeria/paginacao";
import { ROTULO_STATUS_EVENTO, StatusEventoSelo } from "@/components/painel/status-evento";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarEventosDaGestao, STATUS_DE_EVENTO, type FiltroEventosDaGestao } from "@/dados";
import { formatarDataCurta } from "@/lib/formatar";
import { limitarPagina } from "@/lib/galeria";
import { lerPagina } from "@/lib/validacao";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Eventos", robots: { index: false, follow: false } };

const POR_PAGINA = 25;

type Busca = Record<string, string | string[] | undefined>;

function primeiro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

const filtroDaPagina = z.object({
  busca: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(STATUS_DE_EVENTO).optional().catch(undefined),
  de: z.iso.date().optional().catch(undefined),
  ate: z.iso.date().optional().catch(undefined),
});

/** Lê o filtro do endereço com Zod: o que não vale é ignorado. */
function lerFiltro(busca: Busca): FiltroEventosDaGestao {
  return filtroDaPagina.parse({
    busca: primeiro(busca.q) || undefined,
    status: primeiro(busca.status) || undefined,
    de: primeiro(busca.de) || undefined,
    ate: primeiro(busca.ate) || undefined,
  });
}

export default function PaginaEventosDaGestao({ searchParams }: { searchParams: Promise<Busca> }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">
          Todos os eventos de todos os fotógrafos, em qualquer status, do mais recente para o mais
          antigo. Abra um evento para ver as fotos e baixar os originais.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirGestor("/admin/eventos");
  const busca = await searchParams;
  const filtro = lerFiltro(busca);
  const pedida = lerPagina(busca.pagina);
  const primeiraLeitura = await listarEventosDaGestao(filtro, pedida, POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(primeiraLeitura.total / POR_PAGINA));
  const pagina = limitarPagina(pedida, totalPaginas);
  const { eventos, total } =
    pagina === pedida ? primeiraLeitura : await listarEventosDaGestao(filtro, pagina, POR_PAGINA);

  const params = new URLSearchParams();
  if (filtro.busca) params.set("q", filtro.busca);
  if (filtro.status) params.set("status", filtro.status);
  if (filtro.de) params.set("de", filtro.de);
  if (filtro.ate) params.set("ate", filtro.ate);
  const endereco = `/admin/eventos${params.size ? `?${params}` : ""}`;
  const filtrando = params.size > 0;

  return (
    <>
      <form
        method="get"
        action="/admin/eventos"
        role="search"
        aria-label="Filtrar os eventos"
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-q">Buscar</Label>
          <Input
            id="filtro-q"
            type="search"
            name="q"
            maxLength={120}
            placeholder="Nome, endereço, cidade ou fotógrafo"
            defaultValue={filtro.busca ?? ""}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-status">Status</Label>
          <select
            id="filtro-status"
            name="status"
            defaultValue={filtro.status ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="">Todos</option>
            {STATUS_DE_EVENTO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_EVENTO[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-de">Data de</Label>
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
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="touch">
            <Search aria-hidden="true" data-icon="inline-start" />
            Filtrar
          </Button>
          {filtrando && (
            <Link
              href="/admin/eventos"
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
            ? "Nenhum evento com esses filtros."
            : "Nenhum evento ainda."
          : `${total} ${total === 1 ? "evento" : "eventos"}${filtrando ? " com esses filtros" : ""}.`}
      </p>

      {total > 0 && (
        <>
          <Tabela
            colunas={[
              { rotulo: "Evento" },
              { rotulo: "Fotógrafo" },
              { rotulo: "Data" },
              { rotulo: "Cidade" },
              { rotulo: "Status" },
              { rotulo: "Fotos", direita: true },
              { rotulo: "Vendidas", direita: true },
              { rotulo: "Ação" },
            ]}
          >
            {eventos.map((e) => (
              <tr key={e.id}>
                <Celula>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                      {e.capa && (
                        <Image
                          src={e.capa.urlMiniatura}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={`/admin/eventos/${e.id}`}
                        className="font-medium break-words underline-offset-4 hover:underline"
                      >
                        {e.titulo}
                      </Link>
                      <span className="text-xs break-all text-muted-foreground">/{e.slug}</span>
                    </span>
                  </span>
                </Celula>
                <Celula>{e.fotografoNome}</Celula>
                <Celula>
                  <span className="whitespace-nowrap">
                    {formatarDataCurta(e.inicioEm, { hora: false })}
                  </span>
                </Celula>
                <Celula>
                  {e.cidade} – {e.estado}
                </Celula>
                <Celula>
                  <StatusEventoSelo status={e.status} />
                </Celula>
                <Celula direita>{e.totalFotos}</Celula>
                <Celula direita>{e.totalVendidas}</Celula>
                <Celula>
                  <Link
                    href={`/admin/eventos/${e.id}`}
                    aria-label={`Abrir ${e.titulo}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Abrir
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Celula>
              </tr>
            ))}
          </Tabela>
          <Paginacao endereco={endereco} pagina={pagina} totalPaginas={totalPaginas} />
        </>
      )}
    </>
  );
}
