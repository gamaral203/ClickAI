"use client";

import { useMemo, useState } from "react";
import { Calendar, Check, ChevronDown, Mail, Search, ShoppingBag, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClienteDoFotografo, CompraDoCliente, FotoDoCliente } from "@/dados";
import { formatarDataCurta } from "@/lib/formatar";

import { BaixarOriginal } from "./baixar-original";
import { BaixarSelecionadas } from "./baixar-selecionadas";

/** Clientes mostrados de cada vez: a lista cresce com "Mostrar mais". */
const CLIENTES_POR_VEZ = 20;
/** Fotos que cada compra mostra antes de "Ver todas". */
const FOTOS_POR_VEZ = 12;

/** Sem acento e em minúsculas: a busca acha "João" digitando "joao". */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** "11/10/26 às 22:55", no horário de Brasília. */
function diaEHora(iso: string) {
  return formatarDataCurta(iso).replace(" ", " às ");
}

function contarFotos(quantidade: number) {
  return `${quantidade} ${quantidade === 1 ? "foto" : "fotos"}`;
}

/** Títulos dos eventos de onde o cliente levou fotos, sem repetir. */
function eventosDoCliente(cliente: ClienteDoFotografo) {
  return [...new Set(cliente.compras.flatMap((c) => c.fotos.map((f) => f.eventoTitulo)))];
}

type EventoComVendas = { id: string; titulo: string; clientes: number; ultimaVenda: string };

/** Eventos com venda, da venda mais recente para a mais antiga, com quantos clientes cada um. */
function eventosComVendas(clientes: ClienteDoFotografo[]): EventoComVendas[] {
  const eventos = new Map<string, { titulo: string; clientes: Set<string>; ultimaVenda: string }>();
  for (const cliente of clientes) {
    for (const compra of cliente.compras) {
      for (const foto of compra.fotos) {
        const evento = eventos.get(foto.eventoId) ?? {
          titulo: foto.eventoTitulo,
          clientes: new Set<string>(),
          ultimaVenda: compra.compradaEm,
        };
        evento.clientes.add(cliente.chave);
        if (compra.compradaEm > evento.ultimaVenda) evento.ultimaVenda = compra.compradaEm;
        eventos.set(foto.eventoId, evento);
      }
    }
  }
  return [...eventos.entries()]
    .map(([id, e]) => ({
      id,
      titulo: e.titulo,
      clientes: e.clientes.size,
      ultimaVenda: e.ultimaVenda,
    }))
    .sort((a, b) => b.ultimaVenda.localeCompare(a.ultimaVenda));
}

/** O cliente só com as compras e fotos de um evento; `null` se ele não comprou nesse evento. */
function soDoEvento(cliente: ClienteDoFotografo, eventoId: string): ClienteDoFotografo | null {
  const compras = cliente.compras
    .map((c) => ({ ...c, fotos: c.fotos.filter((f) => f.eventoId === eventoId) }))
    .filter((c) => c.fotos.length > 0);
  if (compras.length === 0) return null;
  return {
    ...cliente,
    compras,
    totalFotos: compras.reduce((soma, c) => soma + c.fotos.length, 0),
    ultimaCompraEm: compras[0].compradaEm,
  };
}

/**
 * Meus clientes: quem comprou as fotos do fotógrafo, de quem comprou por último para o primeiro.
 * Com mais de um evento vendido, os eventos ficam no topo: tocar num deles mostra só os clientes
 * dele. Tocar no cliente abre as compras, separadas, com o dia e a hora de cada uma e as fotos que
 * ele levou, sem marca d'água (a miniatura vem da rota do painel, só para o autor). Cada foto tem
 * "Baixar"; em cada compra dá para selecionar fotos e baixar as selecionadas, ou todas.
 */
export function ListaClientes({ clientes }: { clientes: ClienteDoFotografo[] }) {
  const [evento, setEvento] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrando, setMostrando] = useState(CLIENTES_POR_VEZ);
  const eventos = useMemo(() => eventosComVendas(clientes), [clientes]);
  const doEvento = useMemo(
    () =>
      evento
        ? clientes.flatMap((c) => {
            const recorte = soDoEvento(c, evento);
            return recorte ? [recorte] : [];
          })
        : clientes,
    [clientes, evento],
  );
  const termo = normalizar(busca);
  const filtrados = useMemo(
    () =>
      termo
        ? doEvento.filter((c) =>
            normalizar([c.nome, c.email ?? "", ...eventosDoCliente(c)].join(" ")).includes(termo),
          )
        : doEvento,
    [doEvento, termo],
  );

  if (clientes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <Users aria-hidden="true" className="size-8 text-primary" />
        <p>
          Nenhuma foto sua foi vendida ainda. Quando alguém comprar, a pessoa aparece aqui com as
          fotos que levou.
        </p>
      </div>
    );
  }

  function escolherEvento(id: string | null) {
    setEvento(id);
    setMostrando(CLIENTES_POR_VEZ);
  }

  const fotosVendidas = doEvento.reduce((soma, c) => soma + c.totalFotos, 0);
  const restantes = filtrados.length - mostrando;
  return (
    <div className="flex flex-col gap-4">
      {eventos.length > 1 && (
        <section aria-labelledby="eventos-com-vendas" className="flex flex-col gap-2">
          <h2 id="eventos-com-vendas" className="text-sm font-semibold">
            Escolha o evento
          </h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <Chip ativo={evento === null} aoEscolher={() => escolherEvento(null)}>
              Todos os eventos
              <span className="text-muted-foreground">{clientes.length}</span>
            </Chip>
            {eventos.map((e) => (
              <Chip key={e.id} ativo={evento === e.id} aoEscolher={() => escolherEvento(e.id)}>
                <span className="max-w-56 truncate">{e.titulo}</span>
                <span className="text-muted-foreground">{e.clientes}</span>
              </Chip>
            ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Numero rotulo="Clientes" valor={doEvento.length} />
        <Numero rotulo="Fotos vendidas" valor={fotosVendidas} />
      </div>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar cliente"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setMostrando(CLIENTES_POR_VEZ);
          }}
          placeholder="Buscar por nome, e-mail ou evento"
          className="h-11 pl-9"
        />
      </div>
      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum cliente encontrado.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtrados.slice(0, mostrando).map((cliente) => (
            // A chave muda com o evento: trocar de evento fecha os clientes e limpa as seleções.
            <li key={`${evento ?? "todos"}:${cliente.chave}`}>
              <CartaoCliente cliente={cliente} />
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 && (
        <Button
          variant="outline"
          size="touch"
          className="self-center"
          onClick={() => setMostrando((n) => n + CLIENTES_POR_VEZ)}
        >
          Mostrar mais {Math.min(CLIENTES_POR_VEZ, restantes)} de {restantes}
        </Button>
      )}
    </div>
  );
}

function Chip({
  ativo,
  aoEscolher,
  children,
}: {
  ativo: boolean;
  aoEscolher: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoEscolher}
      className="inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
    >
      {children}
    </button>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border p-3 sm:p-4">
      <span className="text-xs text-muted-foreground sm:text-sm">{rotulo}</span>
      <span className="text-xl font-bold tabular-nums sm:text-2xl">{valor}</span>
    </div>
  );
}

function inicial(nome: string) {
  return nome.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Um cliente. Fechado: quem é, de que evento comprou, quantas fotos levou e quando comprou por
 * último. Aberto: cada compra separada (as miniaturas só carregam quando ele abre).
 */
function CartaoCliente({ cliente }: { cliente: ClienteDoFotografo }) {
  const eventos = eventosDoCliente(cliente);
  const quantasCompras = cliente.compras.length;
  return (
    <details className="group rounded-xl border open:border-primary/40">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 sm:px-4 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
        >
          {inicial(cliente.nome)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{cliente.nome}</span>
          <span className="truncate text-xs text-muted-foreground">
            {cliente.email ?? "Conta excluída pelo cliente"}
          </span>
          <span
            className="flex min-w-0 items-center gap-1 text-xs text-primary"
            title={eventos.join(" · ")}
          >
            <Calendar aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">{eventos[0]}</span>
            {eventos.length > 1 && (
              <span className="shrink-0 font-medium">
                +{eventos.length - 1}
                <span className="sr-only"> {eventos.length === 2 ? "evento" : "eventos"}</span>
              </span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{contarFotos(cliente.totalFotos)}</span>
          <span>{formatarDataCurta(cliente.ultimaCompraEm)}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t p-3 sm:p-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {quantasCompras} {quantasCompras === 1 ? "compra" : "compras"} com fotos suas
          </span>
          {cliente.email && (
            <a
              href={`mailto:${cliente.email}`}
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <Mail aria-hidden="true" className="size-3.5" />
              Enviar e-mail
            </a>
          )}
        </p>
        {cliente.compras.map((compra) => (
          <Compra key={compra.pedidoId} compra={compra} />
        ))}
      </div>
    </details>
  );
}

/**
 * Uma compra: dia e hora do pagamento, o evento e as fotos que o cliente levou nela. Tocar na foto
 * a seleciona; o botão embaixo baixa as selecionadas, ou todas se nenhuma estiver marcada.
 */
function Compra({ compra }: { compra: CompraDoCliente }) {
  const [todas, setTodas] = useState(false);
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const eventos = [...new Set(compra.fotos.map((f) => f.eventoTitulo))];
  const visiveis = todas ? compra.fotos : compra.fotos.slice(0, FOTOS_POR_VEZ);
  const alvo =
    selecionadas.size > 0 ? compra.fotos.filter((f) => selecionadas.has(f.fotoId)) : compra.fotos;

  function alternar(fotoId: string) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(fotoId)) nova.delete(fotoId);
      else nova.add(fotoId);
      return nova;
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2 sm:p-3">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ShoppingBag aria-hidden="true" className="size-4 text-primary" />
          Compra de {diaEHora(compra.compradaEm)}
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {contarFotos(compra.fotos.length)} ·{" "}
          {eventos.length === 1 ? eventos[0] : `${eventos.length} eventos`}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visiveis.map((foto) => (
          <FotoComprada
            key={foto.fotoId}
            foto={foto}
            selecionada={selecionadas.has(foto.fotoId)}
            aoAlternar={() => alternar(foto.fotoId)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-start gap-2">
        {compra.fotos.length > 1 && (
          <BaixarSelecionadas
            fotos={alvo}
            rotulo={
              selecionadas.size > 0
                ? selecionadas.size === 1
                  ? "Baixar 1 selecionada"
                  : `Baixar ${selecionadas.size} selecionadas`
                : `Baixar todas (${compra.fotos.length})`
            }
          />
        )}
        {selecionadas.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelecionadas(new Set())}>
            Limpar seleção
          </Button>
        )}
        {compra.fotos.length > FOTOS_POR_VEZ && (
          <Button variant="ghost" size="sm" onClick={() => setTodas((v) => !v)}>
            {todas ? "Mostrar menos" : `Ver todas as ${compra.fotos.length} fotos`}
          </Button>
        )}
      </div>
    </section>
  );
}

function FotoComprada({
  foto,
  selecionada,
  aoAlternar,
}: {
  foto: FotoDoCliente;
  selecionada: boolean;
  aoAlternar: () => void;
}) {
  return (
    <li
      className={`flex min-w-0 flex-col gap-1.5 rounded-lg border bg-background p-1.5 ${
        selecionada ? "border-primary ring-2 ring-primary/40" : ""
      }`}
    >
      <label className="relative block aspect-square cursor-pointer overflow-hidden rounded-md bg-muted">
        <input
          type="checkbox"
          checked={selecionada}
          onChange={aoAlternar}
          aria-label={`Selecionar ${foto.nomeArquivo}`}
          className="peer sr-only"
        />
        <MiniaturaSemMarca foto={foto} />
        <span
          aria-hidden="true"
          className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white bg-black/30 text-white shadow-sm peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/60"
        >
          {selecionada && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </label>
      <p className="truncate text-xs" title={`${foto.nomeArquivo} · ${foto.eventoTitulo}`}>
        {foto.nomeArquivo}
      </p>
      <BaixarOriginal
        eventoId={foto.eventoId}
        fotoId={foto.fotoId}
        nomeArquivo={foto.nomeArquivo}
        rotulo="Baixar"
      />
    </li>
  );
}

/**
 * A miniatura sem marca d'água vem da rota do painel, presa à sessão (o otimizador de imagens do
 * Next não leva o cookie, então é um <img> comum). É gerada na hora a partir do original: até
 * chegar, o quadro fica pulsando. No vídeo, ou se ela não vier, entra a miniatura pública.
 */
function MiniaturaSemMarca({ foto }: { foto: FotoDoCliente }) {
  const [semMarca, setSemMarca] = useState(foto.tipo === "foto");
  const [carregou, setCarregou] = useState(false);
  return (
    <>
      {!carregou && (
        <span aria-hidden="true" className="absolute inset-0 bg-muted motion-safe:animate-pulse" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- rota do painel, presa à sessão */}
      <img
        src={semMarca ? `/api/painel/sem-marca/${foto.fotoId}` : foto.urlMiniatura}
        alt={foto.nomeArquivo}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setCarregou(true)}
        onError={() => {
          if (semMarca) setSemMarca(false);
          else setCarregou(true);
        }}
        className="absolute inset-0 size-full object-cover"
      />
    </>
  );
}
