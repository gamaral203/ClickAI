import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search, X } from "lucide-react";

import {
  BotaoConferirPagamento,
  BotaoReenviarLink,
  BotaoReembolsar,
  BotaoRestaurar,
} from "@/components/admin/acoes-estorno";
import { Celula, Tabela } from "@/components/admin/tabela";
import { CodigoCopiavel } from "@/components/admin/codigo-copiavel";
import {
  listarEstornosDoAdmin,
  listarPedidosDoAdmin,
  type EstornoDoAdmin,
  type PedidoDoAdmin,
  type StatusPedido,
} from "@/dados";
import { formatarDataCurta, formatarPreco } from "@/lib/formatar";
import { buttonVariants } from "@/components/ui/button";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Financeiro", robots: { index: false, follow: false } };

const STATUS: Record<StatusPedido, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  expirado: "Expirado",
  cancelado: "Cancelado",
  estornado: "Estornado",
  contestado: "Em contestação",
};

type FiltroStatus = StatusPedido | "todos";

/** Chips de status, na ordem em que a equipe mais procura. */
const FILTROS: { id: FiltroStatus; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "pago", rotulo: "Pagos" },
  { id: "pendente", rotulo: "Aguardando pagamento" },
  { id: "expirado", rotulo: "Expirados" },
  { id: "estornado", rotulo: "Estornados" },
  { id: "contestado", rotulo: "Em contestação" },
  { id: "cancelado", rotulo: "Cancelados" },
];

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Endereço da página com a busca e o status (sem os vazios). */
function enderecoDoFiltro(busca: string, status: FiltroStatus) {
  const p = new URLSearchParams();
  if (busca) p.set("busca", busca);
  if (status !== "todos") p.set("status", status);
  const q = p.toString();
  return q ? `/admin/vendas?${q}` : "/admin/vendas";
}

export default function PaginaVendasGestao({ searchParams }: PageProps<"/admin/vendas">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/admin/vendas">["searchParams"];
}) {
  await exigirGestor("/admin/vendas");
  const parametros = await searchParams;
  const busca = typeof parametros.busca === "string" ? parametros.busca.trim().slice(0, 100) : "";
  const statusPedido = typeof parametros.status === "string" ? parametros.status : "";
  const status: FiltroStatus = FILTROS.some((f) => f.id === statusPedido)
    ? (statusPedido as FiltroStatus)
    : "todos";
  const [todos, estornos] = await Promise.all([listarPedidosDoAdmin(), listarEstornosDoAdmin()]);

  // Busca em nome, e-mail, vendedores, código do pagamento e número do pedido, sem acento.
  const termo = normalizar(busca);
  const achados = termo
    ? todos.filter((p) =>
        normalizar(
          [p.nomeComprador, p.emailComprador, p.fotografos.join(" "), p.gatewayId ?? "", p.id].join(
            " ",
          ),
        ).includes(termo),
      )
    : todos;
  const contagem = new Map<FiltroStatus, number>([["todos", achados.length]]);
  for (const p of achados) contagem.set(p.status, (contagem.get(p.status) ?? 0) + 1);
  const pedidos = status === "todos" ? achados : achados.filter((p) => p.status === status);

  return (
    <>
      <h2 className="text-xl font-semibold">Pedidos</h2>
      <div className="flex flex-col gap-3">
        <form action="/admin/vendas" className="flex gap-2">
          {status !== "todos" && <input type="hidden" name="status" value={status} />}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar pedido</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Buscar por nome, e-mail, vendedor ou código do pagamento"
              className="h-11 w-full rounded-xl border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <button
            type="submit"
            className={buttonVariants({ size: "touch", className: "rounded-xl" })}
          >
            Buscar
          </button>
          {busca && (
            <Link
              href={enderecoDoFiltro("", status)}
              aria-label="Limpar a busca"
              className={buttonVariants({
                variant: "outline",
                size: "touch",
                className: "rounded-xl",
              })}
            >
              <X aria-hidden="true" />
            </Link>
          )}
        </form>
        <nav
          aria-label="Status do pedido"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {FILTROS.map((f) => {
            const quantos = contagem.get(f.id) ?? 0;
            if (f.id !== "todos" && f.id !== status && quantos === 0) return null;
            const ativo = f.id === status;
            return (
              <Link
                key={f.id}
                href={enderecoDoFiltro(busca, f.id)}
                aria-current={ativo ? "page" : undefined}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold ${
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted"
                }`}
              >
                {f.rotulo}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${ativo ? "bg-white/25" : "bg-muted text-muted-foreground"}`}
                >
                  {quantos}
                </span>
              </Link>
            );
          })}
        </nav>
        {busca && (
          <p className="text-sm text-muted-foreground">
            {pedidos.length} {pedidos.length === 1 ? "pedido encontrado" : "pedidos encontrados"}{" "}
            para &quot;{busca}&quot;.
          </p>
        )}
      </div>
      <ListaPedidos
        pedidos={pedidos}
        vazio={
          busca || status !== "todos" ? "Nenhum pedido com esse filtro." : "Nenhum pedido ainda."
        }
      />
      <Estornos estornos={estornos} />
    </>
  );
}

/** "RYAN MENEZES DE ALMEIDA" → "Ryan Almeida". Só na exibição; o dado não muda. */
function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return nome;
  const curto = partes.length > 2 ? [partes[0], partes[partes.length - 1]] : partes;
  // Nome todo em maiúsculas (ou minúsculas) ganha capitalização normal; marcas como "Click CG" ficam.
  const semCaixa = nome === nome.toUpperCase() || nome === nome.toLowerCase();
  return curto
    .map((p) =>
      semCaixa ? p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR") : p,
    )
    .join(" ");
}

/** Os 2 primeiros vendedores encurtados e "+N"; a lista completa fica no `title`. */
function Vendedores({ nomes }: { nomes: string[] }) {
  if (nomes.length === 0) return <span className="text-muted-foreground">—</span>;
  const visiveis = nomes.slice(0, 2);
  const resto = nomes.length - visiveis.length;
  return (
    <span title={nomes.join(", ")} className="flex flex-wrap items-center gap-1">
      {visiveis.map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="max-w-[11rem] truncate rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
        >
          {nomeCurto(n)}
        </span>
      ))}
      {resto > 0 && (
        <span className="rounded-full border px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
          +{resto}
          <span className="sr-only">: {nomes.slice(2).join(", ")}</span>
        </span>
      )}
    </span>
  );
}

const COR_STATUS: Record<StatusPedido, string> = {
  pago: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-200",
  pendente: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-200",
  expirado: "bg-muted text-muted-foreground ring-border",
  cancelado: "bg-muted text-muted-foreground ring-border",
  estornado: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-200",
  contestado:
    "bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-200",
};

function Status({ p }: { p: PedidoDoAdmin }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span
        className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${COR_STATUS[p.status]}`}
      >
        {STATUS[p.status]}
      </span>
      {p.pagoEm && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatarDataCurta(p.pagoEm)}
        </span>
      )}
    </span>
  );
}

/** As ações do pedido, as mesmas da tabela e dos cartões. */
function AcoesDoPedido({ p }: { p: PedidoDoAdmin }) {
  const total = formatarPreco(p.totalCentavos);
  if (p.status === "pago" && p.reembolsoSolicitadoEm) {
    return (
      <span className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
        Reembolso pedido em {formatarDataCurta(p.reembolsoSolicitadoEm)}
        <BotaoReembolsar pedidoId={p.id} total={total} />
      </span>
    );
  }
  if (p.status === "pago") {
    return (
      <span className="flex flex-wrap items-start gap-1.5">
        <BotaoReenviarLink pedidoId={p.id} />
        <BotaoReembolsar pedidoId={p.id} total={total} />
      </span>
    );
  }
  if (p.status === "contestado") return <BotaoRestaurar pedidoId={p.id} />;
  if (p.status === "pendente" && p.gatewayId) return <BotaoConferirPagamento pedidoId={p.id} />;
  return null;
}

/** Mesmas condições de AcoesDoPedido: o cartão só ganha a faixa de ações quando há alguma. */
function temAcoes(p: PedidoDoAdmin) {
  return (
    p.status === "pago" || p.status === "contestado" || (p.status === "pendente" && !!p.gatewayId)
  );
}

function Pagamento({ p }: { p: PedidoDoAdmin }) {
  return (
    <span className="flex min-w-0 flex-col">
      {p.metodo === "pix" ? "Pix" : "Cartão"}
      {p.gatewayId && <CodigoCopiavel valor={p.gatewayId} />}
    </span>
  );
}

/**
 * Pedidos: tabela a partir de 1024 px (rola dentro do quadro se não couber, nunca corta coluna);
 * abaixo disso, um cartão por pedido.
 */
function ListaPedidos({ pedidos, vazio }: { pedidos: PedidoDoAdmin[]; vazio: string }) {
  if (pedidos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {vazio}
      </p>
    );
  }
  const th = "px-4 py-3 font-medium whitespace-nowrap";
  // Ações presas à direita: se a tabela rolar para o lado, os botões continuam à vista.
  const fixaDireita =
    "sticky right-0 z-10 shadow-[inset_1px_0_0_var(--border),-8px_0_8px_-8px_rgb(0_0_0/0.18)]";
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border lg:block">
        <table className="w-full min-w-[62rem] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className={`${th} w-[8.5rem]`}>
                Pedido em
              </th>
              <th scope="col" className={th}>
                Comprador
              </th>
              <th scope="col" className={`${th} w-[10rem]`}>
                Vendedores
              </th>
              <th scope="col" className={`${th} w-[10rem]`}>
                Pagamento
              </th>
              <th scope="col" className={`${th} w-[8.5rem]`}>
                Status
              </th>
              <th scope="col" className={`${th} w-[7rem] text-right`}>
                Total
              </th>
              <th scope="col" className={`${th} ${fixaDireita} w-[11rem] bg-muted`}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pedidos.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-4 py-3">
                  <span className="flex flex-col">
                    <span className="whitespace-nowrap tabular-nums">
                      {formatarDataCurta(p.criadoEm)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.itens} {p.itens === 1 ? "item" : "itens"}
                    </span>
                  </span>
                </td>
                <td className="min-w-[12rem] px-4 py-3">
                  <span className="flex flex-col">
                    <span className="max-w-[13rem] font-medium 2xl:max-w-[22rem]">
                      {p.nomeComprador}
                    </span>
                    <span
                      title={p.emailComprador}
                      className="block max-w-[13rem] truncate text-xs text-muted-foreground 2xl:max-w-[22rem]"
                    >
                      {p.emailComprador}
                    </span>
                  </span>
                </td>
                <td className="min-w-[9rem] px-4 py-3">
                  <Vendedores nomes={p.fotografos} />
                </td>
                <td className="max-w-[10rem] px-4 py-3">
                  <Pagamento p={p} />
                </td>
                <td className="px-4 py-3">
                  <Status p={p} />
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                  {formatarPreco(p.totalCentavos)}
                </td>
                <td className={`${fixaDireita} min-w-[10rem] bg-background px-4 py-3`}>
                  <AcoesDoPedido p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {pedidos.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold [overflow-wrap:anywhere]">{p.nomeComprador}</span>
                <span title={p.emailComprador} className="truncate text-xs text-muted-foreground">
                  {p.emailComprador}
                </span>
              </span>
              <span className="shrink-0 text-right text-base font-bold whitespace-nowrap tabular-nums">
                {formatarPreco(p.totalCentavos)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatarDataCurta(p.criadoEm)}</span>
              <span>
                {p.itens} {p.itens === 1 ? "item" : "itens"}
              </span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Status p={p} />
              <span className="max-w-[60%] text-sm">
                <Pagamento p={p} />
              </span>
            </div>
            <Vendedores nomes={p.fotografos} />
            {temAcoes(p) && (
              <div className="border-t pt-3">
                <AcoesDoPedido p={p} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Id da cobrança no gateway: curto na tela, inteiro no `title` e com botão de copiar. */
function Codigo({ valor }: { valor: string }) {
  return (
    <span className="block max-w-[11rem]">
      <CodigoCopiavel valor={valor} />
    </span>
  );
}

function situacaoDoEstorno(e: EstornoDoAdmin) {
  if (e.status === "estornado") {
    return e.motivoEstorno === "chargeback" ? "Chargeback perdido" : "Reembolsado";
  }
  if (e.status === "contestado") return "Chargeback em disputa";
  if (e.reembolsoSolicitadoEm) return "Reembolso aguardando o gateway";
  return "Contestação encerrada a favor";
}

/** Reembolsos e chargebacks, para o gestor acompanhar cada caso. */
function Estornos({ estornos }: { estornos: EstornoDoAdmin[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Estornos e contestações</h2>
      <Tabela
        colunas={[
          { rotulo: "Pedido" },
          { rotulo: "Comprador" },
          { rotulo: "Situação" },
          { rotulo: "Datas" },
          { rotulo: "Total", direita: true },
        ]}
        vazio="Nenhum reembolso ou chargeback."
      >
        {estornos.map((e) => (
          <tr key={e.id}>
            <Celula>
              <span className="flex flex-col">
                {e.metodo === "pix" ? "Pix" : "Cartão"}
                {e.gatewayId && <Codigo valor={e.gatewayId} />}
              </span>
            </Celula>
            <Celula>
              <span className="flex flex-col">
                {e.nomeComprador}
                <span className="text-xs text-muted-foreground">{e.emailComprador}</span>
              </span>
            </Celula>
            <Celula>
              <span className="flex flex-col">
                <span className="font-medium">{situacaoDoEstorno(e)}</span>
                {e.reembolsoSolicitadoPor && (
                  <span className="text-xs text-muted-foreground">
                    Pedido por {e.reembolsoSolicitadoPor}
                  </span>
                )}
              </span>
            </Celula>
            <Celula>
              <span className="flex flex-col text-xs text-muted-foreground">
                {e.pagoEm && <span>Pago {formatarDataCurta(e.pagoEm)}</span>}
                {e.reembolsoSolicitadoEm && (
                  <span>Pedido {formatarDataCurta(e.reembolsoSolicitadoEm)}</span>
                )}
                {e.contestadoEm && <span>Contestado {formatarDataCurta(e.contestadoEm)}</span>}
                {e.estornadoEm && <span>Estornado {formatarDataCurta(e.estornadoEm)}</span>}
              </span>
            </Celula>
            <Celula direita forte>
              {formatarPreco(e.totalCentavos)}
            </Celula>
          </tr>
        ))}
      </Tabela>
    </section>
  );
}
