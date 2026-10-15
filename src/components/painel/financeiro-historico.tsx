import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";

import { FiltrosDoHistorico } from "@/components/painel/financeiro-historico-filtros";
import {
  filtrarHistorico,
  historicoFinanceiroDoFotografo,
  lerFiltrosDoHistorico,
  PARAMETROS_HISTORICO,
  PERIODOS_HISTORICO,
  ROTULO_PERIODO_HISTORICO,
  ROTULO_STATUS_HISTORICO,
  ROTULO_TIPO_HISTORICO,
  TIPOS_HISTORICO,
  type FiltrosDoHistorico as Filtros,
  type LinhaDoHistorico,
  type StatusDoHistorico,
} from "@/dados";
import { formatarDataCurta, formatarPreco } from "@/lib/formatar";
import { TAXA_ANTECIPACAO_TEXTO } from "@/servicos/financeiro";

type Parametros = Record<string, string | string[] | undefined>;

/**
 * Histórico financeiro no fim de Vendas e saques: cada venda, estorno e transferência com o bruto,
 * a comissão, a antecipação e o líquido. Componente de servidor; os dados entram por Suspense
 * porque a consulta lê a hora (Cache Components), e os filtros ficam na URL (`h_periodo`,
 * `h_tipo`, `h_pagina`) para o link e o voltar do navegador funcionarem.
 */
export function HistoricoFinanceiro({
  fotografoId,
  searchParams,
}: {
  fotografoId: string;
  searchParams: Promise<Parametros>;
}) {
  return (
    <section aria-labelledby="titulo-historico" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="titulo-historico" className="flex items-center gap-2 text-xl font-semibold">
          <History aria-hidden="true" className="size-5 text-primary" />
          Histórico
        </h2>
        <p className="text-sm text-muted-foreground">
          Cada venda com a comissão da plataforma, a taxa de antecipação do cartão (
          {TAXA_ANTECIPACAO_TEXTO}, só quando liberado antes dos 30 dias) e quando ficou disponível,
          além das transferências para a sua conta.
        </p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo fotografoId={fotografoId} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Conteudo({
  fotografoId,
  searchParams,
}: {
  fotografoId: string;
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const filtros = lerFiltrosDoHistorico(parametros);
  const { agora, linhas } = await historicoFinanceiroDoFotografo(fotografoId);
  const pagina = filtrarHistorico(linhas, filtros, agora);
  // Os parâmetros da página que não são do histórico seguem iguais nos filtros e na paginação.
  const outros: Record<string, string[]> = {};
  for (const [chave, valor] of Object.entries(parametros)) {
    if (chave.startsWith("h_") || valor === undefined) continue;
    outros[chave] = Array.isArray(valor) ? valor : [valor];
  }

  if (linhas.length === 0) {
    return (
      <Vazio texto="Nenhuma venda ainda. Quando você vender, cada venda aparece aqui com a comissão, as taxas e a data em que o valor fica disponível." />
    );
  }

  return (
    <>
      <FiltrosDoHistorico
        outros={outros}
        parametroPagina={PARAMETROS_HISTORICO.pagina}
        grupos={[
          {
            parametro: PARAMETROS_HISTORICO.periodo,
            titulo: "Período",
            atual: filtros.periodo,
            padrao: "tudo",
            opcoes: PERIODOS_HISTORICO.map((p) => ({
              valor: p,
              rotulo: ROTULO_PERIODO_HISTORICO[p],
            })),
          },
          {
            parametro: PARAMETROS_HISTORICO.tipo,
            titulo: "Tipo",
            atual: filtros.tipo,
            padrao: "todos",
            opcoes: TIPOS_HISTORICO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_HISTORICO[t] })),
          },
        ]}
      />
      {pagina.total === 0 ? (
        <Vazio texto="Nada encontrado com estes filtros. Tente um período maior ou outro tipo.">
          <Link
            href={endereco(outros, { ...filtros, periodo: "tudo", tipo: "todos", pagina: 1 })}
            scroll={false}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver tudo
          </Link>
        </Vazio>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {pagina.total === 1 ? "1 registro" : `${pagina.total} registros`}
            {pagina.paginas > 1 && ` · página ${pagina.pagina} de ${pagina.paginas}`}
          </p>
          <TabelaDoHistorico linhas={pagina.linhas} />
          <CartoesDoHistorico linhas={pagina.linhas} />
          {pagina.linhas.some(
            (l) => l.tipo !== "transferencia" && l.previsto && l.status !== "estornado",
          ) && (
            <p className="text-xs text-muted-foreground">
              * Ainda não transferido: comissão e antecipação previstas pela configuração atual. A
              comissão sai uma vez só, sobre o total de cada transferência, e pode variar alguns
              centavos.
            </p>
          )}
          {pagina.paginas > 1 && (
            <Paginacao
              outros={outros}
              filtros={filtros}
              pagina={pagina.pagina}
              paginas={pagina.paginas}
            />
          )}
        </>
      )}
    </>
  );
}

/** Endereço relativo (só a busca) com os filtros do histórico, sem os valores padrão. */
function endereco(outros: Record<string, string[]>, f: Filtros) {
  const p = new URLSearchParams();
  for (const [chave, valores] of Object.entries(outros)) {
    for (const v of valores) p.append(chave, v);
  }
  if (f.periodo !== "tudo") p.set(PARAMETROS_HISTORICO.periodo, f.periodo);
  if (f.tipo !== "todos") p.set(PARAMETROS_HISTORICO.tipo, f.tipo);
  if (f.pagina > 1) p.set(PARAMETROS_HISTORICO.pagina, String(f.pagina));
  return `?${p.toString()}`;
}

function Vazio({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-8 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{texto}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Peças da linha

const COR_STATUS: Record<StatusDoHistorico, string> = {
  a_receber: "bg-muted text-muted-foreground",
  // Limão só com texto escuro (globals.css).
  disponivel: "bg-highlight text-highlight-foreground",
  em_transferencia: "border border-primary/40 bg-accent text-primary",
  transferido: "bg-primary text-primary-foreground",
  estornado: "bg-destructive/10 text-destructive",
  nao_realizada: "bg-destructive/10 text-destructive",
};

function Status({ status }: { status: StatusDoHistorico }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${COR_STATUS[status]}`}
    >
      {ROTULO_STATUS_HISTORICO[status]}
    </span>
  );
}

function descricao(l: LinhaDoHistorico) {
  if (l.tipo === "transferencia") {
    return l.automatica ? "Transferência automática" : "Transferência";
  }
  return l.tipo === "estorno" ? `Estorno · ${l.eventoTitulo}` : l.eventoTitulo;
}

function metodo(l: LinhaDoHistorico) {
  if (l.tipo === "transferencia") return "Pix";
  return l.metodo === "pix" ? "Pix" : "Cartão";
}

/** Comissão e taxa saem do bruto, então aparecem com sinal de menos (no estorno, voltam: mais). */
function desconto(centavos: number) {
  return centavos === 0 ? "—" : formatarPreco(-centavos);
}

const data = (iso: string | null, hora = false) => (iso ? formatarDataCurta(iso, { hora }) : "—");

/** Asterisco nos valores ainda previstos (venda sem transferência). */
function marca(l: LinhaDoHistorico) {
  return l.tipo !== "transferencia" && l.previsto && l.status !== "estornado" ? "*" : "";
}

function disponivel(l: LinhaDoHistorico) {
  return l.tipo === "transferencia" ? "—" : data(l.disponivelEm);
}

function transferido(l: LinhaDoHistorico) {
  if (l.transferidoEm) return data(l.transferidoEm);
  return l.status === "em_transferencia" ? "Aguardando" : "—";
}

// ---------------------------------------------------------------- Computador: tabela

const COLUNAS = [
  { rotulo: "Data" },
  { rotulo: "Descrição" },
  { rotulo: "Método" },
  { rotulo: "Bruto", direita: true },
  { rotulo: "Comissão", direita: true },
  { rotulo: "Antecipação", direita: true },
  { rotulo: "Líquido", direita: true },
  { rotulo: "Disponível em" },
  { rotulo: "Transferido em" },
  { rotulo: "Status" },
];

function TabelaDoHistorico({ linhas }: { linhas: LinhaDoHistorico[] }) {
  return (
    // A partir de 1024 px; rola dentro do quadro se a tela for estreita para as 10 colunas.
    <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            {COLUNAS.map((c) => (
              <th
                key={c.rotulo}
                scope="col"
                className={`px-3 py-3 font-medium whitespace-nowrap ${c.direita ? "text-right" : ""}`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map((l) => (
            <tr
              key={`${l.tipo}-${l.id}`}
              className={l.tipo === "transferencia" ? "bg-accent/40" : undefined}
            >
              <td className="px-3 py-3 whitespace-nowrap tabular-nums">{data(l.data, true)}</td>
              <td className="max-w-56 truncate px-3 py-3 font-medium" title={descricao(l)}>
                {descricao(l)}
              </td>
              <td className="px-3 py-3">{metodo(l)}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                {formatarPreco(l.brutoCentavos)}
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                {desconto(l.comissaoCentavos)}
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                {desconto(l.taxaAntecipacaoCentavos)}
              </td>
              <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                {formatarPreco(l.liquidoCentavos)}
                {marca(l)}
              </td>
              <td className="px-3 py-3 whitespace-nowrap tabular-nums">{disponivel(l)}</td>
              <td className="px-3 py-3 whitespace-nowrap tabular-nums">{transferido(l)}</td>
              <td className="px-3 py-3">
                <Status status={l.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Celular: cartões

function CartoesDoHistorico({ linhas }: { linhas: LinhaDoHistorico[] }) {
  return (
    <ul className="flex flex-col gap-2 lg:hidden">
      {linhas.map((l) => (
        <li
          key={`${l.tipo}-${l.id}`}
          className={`flex flex-col gap-2 rounded-xl border p-4 ${
            l.tipo === "transferencia" ? "border-primary/30 bg-accent/40" : "bg-card"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{descricao(l)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {data(l.data, true)} · {metodo(l)}
              </span>
            </div>
            <Status status={l.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Item rotulo="Bruto" valor={formatarPreco(l.brutoCentavos)} />
            <Item rotulo="Comissão" valor={desconto(l.comissaoCentavos)} />
            <Item rotulo="Antecipação" valor={desconto(l.taxaAntecipacaoCentavos)} />
            <Item rotulo="Líquido" valor={`${formatarPreco(l.liquidoCentavos)}${marca(l)}`} forte />
            {l.tipo !== "transferencia" && <Item rotulo="Disponível em" valor={disponivel(l)} />}
            <Item rotulo="Transferido em" valor={transferido(l)} />
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Item({
  rotulo,
  valor,
  forte = false,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={`tabular-nums ${forte ? "font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- Paginação

function Paginacao({
  outros,
  filtros,
  pagina,
  paginas,
}: {
  outros: Record<string, string[]>;
  filtros: Filtros;
  pagina: number;
  paginas: number;
}) {
  const botao =
    "inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent";
  const inativo =
    "inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-muted-foreground opacity-50";
  return (
    <nav aria-label="Páginas do histórico" className="flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <Link
          href={endereco(outros, { ...filtros, pagina: pagina - 1 })}
          scroll={false}
          className={botao}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Anterior
        </Link>
      ) : (
        <span className={inativo} aria-disabled="true">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Anterior
        </span>
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        {pagina} de {paginas}
      </span>
      {pagina < paginas ? (
        <Link
          href={endereco(outros, { ...filtros, pagina: pagina + 1 })}
          scroll={false}
          className={botao}
        >
          Próxima
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span className={inativo} aria-disabled="true">
          Próxima
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      )}
    </nav>
  );
}
