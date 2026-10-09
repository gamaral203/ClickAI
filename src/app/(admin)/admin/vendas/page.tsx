import type { Metadata } from "next";
import { Suspense } from "react";

import { BotaoReembolsar, BotaoRestaurar } from "@/components/admin/acoes-estorno";
import { Celula, Tabela } from "@/components/admin/tabela";
import {
  listarEstornosDoAdmin,
  listarPedidosDoAdmin,
  type EstornoDoAdmin,
  type StatusPedido,
} from "@/dados";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
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

export default function PaginaVendasGestao() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirGestor("/admin/vendas");
  const [pedidos, estornos] = await Promise.all([listarPedidosDoAdmin(), listarEstornosDoAdmin()]);

  return (
    <>
      <Estornos estornos={estornos} />
      <h2 className="text-xl font-semibold">Pedidos</h2>
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
        vazio="Nenhum pedido ainda."
      >
        {pedidos.map((p) => (
          <tr key={p.id}>
            <Celula>
              <span className="flex flex-col whitespace-nowrap">
                {formatarDataEHora(p.criadoEm)}
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
              <span className="flex flex-col whitespace-nowrap">
                {p.metodo === "pix" ? "Pix" : "Cartão"}
                {p.gatewayId && (
                  <span className="font-mono text-xs text-muted-foreground">{p.gatewayId}</span>
                )}
              </span>
            </Celula>
            <Celula>
              <span className="flex flex-col whitespace-nowrap">
                {STATUS[p.status]}
                {p.pagoEm && (
                  <span className="text-xs text-muted-foreground">
                    {formatarDataEHora(p.pagoEm)}
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
                  Reembolso pedido em {formatarDataEHora(p.reembolsoSolicitadoEm)}
                  <BotaoReembolsar pedidoId={p.id} total={formatarPreco(p.totalCentavos)} />
                </span>
              ) : p.status === "pago" ? (
                <BotaoReembolsar pedidoId={p.id} total={formatarPreco(p.totalCentavos)} />
              ) : p.status === "contestado" ? (
                <BotaoRestaurar pedidoId={p.id} />
              ) : null}
            </Celula>
          </tr>
        ))}
      </Tabela>
    </>
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
              <span className="flex flex-col whitespace-nowrap">
                {e.metodo === "pix" ? "Pix" : "Cartão"}
                {e.gatewayId && (
                  <span className="font-mono text-xs text-muted-foreground">{e.gatewayId}</span>
                )}
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
              <span className="flex flex-col text-xs whitespace-nowrap text-muted-foreground">
                {e.pagoEm && <span>Pago em {formatarDataEHora(e.pagoEm)}</span>}
                {e.reembolsoSolicitadoEm && (
                  <span>Reembolso pedido em {formatarDataEHora(e.reembolsoSolicitadoEm)}</span>
                )}
                {e.contestadoEm && <span>Contestado em {formatarDataEHora(e.contestadoEm)}</span>}
                {e.estornadoEm && <span>Estornado em {formatarDataEHora(e.estornadoEm)}</span>}
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
