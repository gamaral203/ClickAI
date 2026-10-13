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
import {
  listarEstornosDoAdmin,
  listarPedidosDoAdmin,
  type EstornoDoAdmin,
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
      <Tabela
        colunas={[
          { rotulo: "Pedido em" },
          { rotulo: "Comprador" },
          { rotulo: "Vendedores" },
          { rotulo: "Pagamento" },
          { rotulo: "Status" },
          { rotulo: "Total", direita: true },
          { rotulo: "Ações" },
        ]}
        vazio={
          busca || status !== "todos" ? "Nenhum pedido com esse filtro." : "Nenhum pedido ainda."
        }
      >
        {pedidos.map((p) => (
          <tr key={p.id}>
            <Celula>
              <span className="flex flex-col">
                {formatarDataCurta(p.criadoEm)}
                <span className="text-xs text-muted-foreground">
                  {p.itens} {p.itens === 1 ? "item" : "itens"}
                </span>
              </span>
            </Celula>
            <Celula>
              <span className="flex flex-col">
                {p.nomeComprador}
                <span className="text-xs text-muted-foreground">{p.emailComprador}</span>
              </span>
            </Celula>
            <Celula>{p.fotografos.join(", ")}</Celula>
            <Celula>
              <span className="flex flex-col">
                {p.metodo === "pix" ? "Pix" : "Cartão"}
                {p.gatewayId && <Codigo valor={p.gatewayId} />}
              </span>
            </Celula>
            <Celula>
              <span className="flex flex-col">
                {STATUS[p.status]}
                {p.pagoEm && (
                  <span className="text-xs text-muted-foreground">
                    {formatarDataCurta(p.pagoEm)}
                  </span>
                )}
              </span>
            </Celula>
            <Celula direita forte>
              {formatarPreco(p.totalCentavos)}
            </Celula>
            <Celula>
              {p.status === "pago" && p.reembolsoSolicitadoEm ? (
                <span className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
                  Reembolso pedido em {formatarDataCurta(p.reembolsoSolicitadoEm)}
                  <BotaoReembolsar pedidoId={p.id} total={formatarPreco(p.totalCentavos)} />
                </span>
              ) : p.status === "pago" ? (
                <span className="flex flex-col items-start gap-1.5">
                  <BotaoReenviarLink pedidoId={p.id} />
                  <BotaoReembolsar pedidoId={p.id} total={formatarPreco(p.totalCentavos)} />
                </span>
              ) : p.status === "contestado" ? (
                <BotaoRestaurar pedidoId={p.id} />
              ) : p.status === "pendente" && p.gatewayId ? (
                <BotaoConferirPagamento pedidoId={p.id} />
              ) : null}
            </Celula>
          </tr>
        ))}
      </Tabela>
      <Estornos estornos={estornos} />
    </>
  );
}

/** Id da cobrança no gateway: curto na tela, inteiro ao passar o mouse (e dá para copiar). */
function Codigo({ valor }: { valor: string }) {
  return (
    <span title={valor} className="max-w-[12ch] truncate font-mono text-xs text-muted-foreground">
      {valor}
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
