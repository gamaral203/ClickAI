"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  ChartColumn,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Images,
  MapPin,
  MoreHorizontal,
  Palette,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Upload,
  Users,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StatusEvento } from "@/dados/tipos";
import { formatarPreco } from "@/lib/formatar";

export type CartaoMeuEvento = {
  id: string;
  slug: string;
  titulo: string;
  status: StatusEvento;
  cidade: string;
  estado: string;
  local: string | null;
  /** "11 de outubro de 2026". */
  quando: string;
  inicioEm: string;
  /** Ordem em que o painel lista (o mais recente primeiro). */
  posicao: number;
  categoria: string;
  capa: string | null;
  processando: number;
  totalItens: number;
  vendidos: number;
  vendidoCentavos: number;
  /** Evento de outro fotógrafo em que ele colabora. */
  donoNome: string | null;
  /** Aviso de por que a capa ainda não aparece no site (só o dono). */
  avisoCapa: string | null;
  urlPublica: string;
};

type Filtro = "todos" | "publicado" | "rascunho" | "arquivado" | "revisao";
type Ordem = "recentes" | "data" | "vendas";
type Tipo = "todos" | "meus" | "colaboracoes";

const FILTROS: { id: Filtro; rotulo: string; ponto: string }[] = [
  { id: "todos", rotulo: "Todos", ponto: "bg-white" },
  { id: "publicado", rotulo: "Publicados", ponto: "bg-emerald-500" },
  { id: "rascunho", rotulo: "Rascunhos", ponto: "bg-amber-400" },
  { id: "arquivado", rotulo: "Encerrados", ponto: "bg-slate-400" },
  { id: "revisao", rotulo: "Em revisão", ponto: "bg-destructive" },
];

const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: "recentes", rotulo: "Mais recentes" },
  { id: "data", rotulo: "Data do evento" },
  { id: "vendas", rotulo: "Mais vendidos" },
];

const TIPOS: { id: Tipo; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "meus", rotulo: "Só os meus" },
  { id: "colaboracoes", rotulo: "Só colaborações" },
];

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Meus eventos: chips por situação (com quantos), busca por nome, local ou data, filtros (ordem e
 * tipo) num botão à parte e os cartões com a capa, os números e as ações.
 */
export function ListaMeusEventos({ eventos }: { eventos: CartaoMeuEvento[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [tipo, setTipo] = useState<Tipo>("todos");

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      todos: eventos.length,
      publicado: 0,
      rascunho: 0,
      arquivado: 0,
      revisao: 0,
    };
    for (const e of eventos) c[e.status]++;
    return c;
  }, [eventos]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    const lista = eventos.filter(
      (e) =>
        (filtro === "todos" || e.status === filtro) &&
        (tipo === "todos" || (tipo === "meus") === (e.donoNome === null)) &&
        (!termo ||
          normalizar(
            [e.titulo, e.cidade, e.estado, e.local ?? "", e.quando, e.categoria].join(" "),
          ).includes(termo)),
    );
    return lista.sort((a, b) =>
      ordem === "data"
        ? b.inicioEm.localeCompare(a.inicioEm)
        : ordem === "vendas"
          ? b.vendidoCentavos - a.vendidoCentavos || b.vendidos - a.vendidos
          : a.posicao - b.posicao,
    );
  }, [eventos, filtro, tipo, busca, ordem]);

  const filtrosAtivos = (ordem !== "recentes" ? 1 : 0) + (tipo !== "todos" ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar evento, local ou data…"
            aria-label="Buscar evento"
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <details className="group relative">
          <summary
            className={`flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border bg-card px-3.5 text-sm font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden ${
              filtrosAtivos ? "border-primary text-primary" : ""
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {filtrosAtivos}
              </span>
            )}
          </summary>
          <div className="absolute top-full right-0 z-30 mt-2 flex w-64 flex-col gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
            <Opcoes titulo="Ordenar por" opcoes={ORDENS} valor={ordem} aoMudar={setOrdem} />
            <Opcoes titulo="Mostrar" opcoes={TIPOS} valor={tipo} aoMudar={setTipo} />
          </div>
        </details>
      </div>

      <div
        role="group"
        aria-label="Situação dos eventos"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {FILTROS.filter((f) => f.id !== "revisao" || contagem.revisao > 0).map((f) => {
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(f.id)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                ativo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${ativo ? "bg-white" : f.ponto === "bg-white" ? "bg-primary" : f.ponto}`}
              />
              {f.rotulo}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  ativo ? "bg-white/25" : "bg-muted text-muted-foreground"
                }`}
              >
                {contagem[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum evento encontrado.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visiveis.map((e) => (
            <Cartao key={e.id} evento={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Opcoes<T extends string>({
  titulo,
  opcoes,
  valor,
  aoMudar,
}: {
  titulo: string;
  opcoes: { id: T; rotulo: string }[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </legend>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => aoMudar(o.id)}
          className="flex h-9 items-center justify-between rounded-lg px-2.5 text-left text-sm hover:bg-muted aria-pressed:font-semibold aria-pressed:text-primary"
        >
          {o.rotulo}
          {valor === o.id && <Check aria-hidden="true" className="size-4" />}
        </button>
      ))}
    </fieldset>
  );
}

const SELO: Record<StatusEvento, { rotulo: string; classe: string }> = {
  publicado: { rotulo: "Publicado", classe: "bg-highlight text-highlight-foreground" },
  rascunho: { rotulo: "Rascunho", classe: "bg-amber-100 text-amber-900" },
  arquivado: { rotulo: "Encerrado", classe: "bg-slate-200 text-slate-700" },
  revisao: { rotulo: "Em revisão", classe: "bg-red-100 text-red-800" },
};

function Cartao({ evento: e }: { evento: CartaoMeuEvento }) {
  const colaboracao = e.donoNome !== null;
  const abrir = colaboracao
    ? `/painel/colaboracoes#colaboracao-${e.id}`
    : `/painel/eventos/${e.id}`;
  const selo = SELO[e.status];
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-shadow hover:shadow-md">
      <div className="relative">
        <Link
          href={abrir}
          aria-label={`${colaboracao ? "Enviar fotos" : "Gerenciar"}: ${e.titulo}`}
          className="relative block aspect-[16/10] bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {e.capa ? (
            <Image
              src={e.capa}
              alt=""
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Camera aria-hidden="true" className="size-8" />
              <span className="text-sm font-medium">
                {e.processando > 0 ? "Processando as fotos…" : "Sem fotos ainda"}
              </span>
            </span>
          )}
        </Link>
        <span
          className={`absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${selo.classe}`}
        >
          {e.status === "publicado" && <CheckCircle2 aria-hidden="true" className="size-3.5" />}
          {selo.rotulo}
        </span>
        <MenuDoCartao evento={e} />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <Link href={abrir} className="text-lg leading-tight font-bold hover:underline">
            {e.titulo}
          </Link>
          {colaboracao && (
            <p className="flex w-fit items-center gap-1.5 rounded-md bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-foreground">
              <Users aria-hidden="true" className="size-3.5 shrink-0" />
              Colaboração · evento de {e.donoNome}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {e.cidade}, {e.estado}
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
              {e.quando}
            </span>
          </p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Tag aria-hidden="true" className="size-4 shrink-0" />
            {e.categoria}
          </p>
          {e.avisoCapa && (
            <p className="text-xs text-muted-foreground">
              A capa ainda não aparece no site: {e.avisoCapa}.
            </p>
          )}
        </div>

        <dl className="grid grid-cols-3 divide-x rounded-xl bg-muted/60 py-2.5">
          <Numero
            icone={Images}
            valor={e.totalItens.toLocaleString("pt-BR")}
            rotulo={colaboracao ? "Suas fotos" : "Fotos"}
          />
          <Numero
            icone={ShoppingCart}
            valor={e.vendidos.toLocaleString("pt-BR")}
            rotulo="Vendidas"
          />
          <Numero icone={ChartColumn} valor={formatarPreco(e.vendidoCentavos)} rotulo="em vendas" />
        </dl>

        <div className="mt-auto grid grid-cols-[auto_1fr_1fr] gap-2">
          <a
            href={e.urlPublica}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              variant: "secondary",
              size: "touch",
              className: "gap-1 px-1.5 text-[13px] sm:text-sm",
            })}
          >
            <Eye aria-hidden="true" data-icon="inline-start" />
            Ver
            <span className="sr-only">: página pública de {e.titulo} (abre em outra aba)</span>
          </a>
          <Link
            href={`/painel/eventos/${e.id}/desempenho`}
            aria-label={`Desempenho de ${e.titulo}`}
            className={buttonVariants({
              variant: "outline",
              size: "touch",
              className: "gap-1 px-1.5 text-[13px] sm:text-sm",
            })}
          >
            <ChartColumn aria-hidden="true" data-icon="inline-start" className="max-sm:hidden" />
            <span className="truncate">Desempenho</span>
          </Link>
          <Link
            href={abrir}
            className={buttonVariants({
              size: "touch",
              className: "gap-1 px-1.5 text-[13px] sm:text-sm",
            })}
          >
            {colaboracao ? (
              <Upload aria-hidden="true" data-icon="inline-start" className="max-sm:hidden" />
            ) : (
              <Settings aria-hidden="true" data-icon="inline-start" className="max-sm:hidden" />
            )}
            <span className="truncate">{colaboracao ? "Enviar" : "Gerenciar"}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}

function Numero({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: typeof Images;
  valor: string;
  rotulo: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 px-2">
      <Icone aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <dd className="truncate text-sm font-bold tabular-nums sm:text-base">{valor}</dd>
        <dt className="truncate text-xs text-muted-foreground">{rotulo}</dt>
      </div>
    </div>
  );
}

/** Menu "⋯" do cartão: copiar o link, criar artes, ver a página pública. */
function MenuDoCartao({ evento: e }: { evento: CartaoMeuEvento }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(e.urlPublica);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão para copiar: o link continua em "Ver".
    }
  }
  const item =
    "flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium hover:bg-muted";
  return (
    <details className="absolute top-3 right-3">
      <summary
        aria-label={`Mais opções de ${e.titulo}`}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg bg-white/95 text-slate-900 shadow-sm hover:bg-white [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </summary>
      <div className="absolute top-full right-0 z-20 mt-1.5 flex w-52 flex-col rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
        <button type="button" onClick={copiar} className={item}>
          {copiado ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copiado ? "Link copiado" : "Copiar link"}
        </button>
        {e.donoNome === null && (
          <Link href={`/painel/eventos/${e.id}?secao=design`} className={item}>
            <Palette aria-hidden="true" className="size-4" />
            Criar artes
          </Link>
        )}
        <a href={e.urlPublica} target="_blank" rel="noopener noreferrer" className={item}>
          <Eye aria-hidden="true" className="size-4" />
          Ver página pública
        </a>
      </div>
    </details>
  );
}
