import type { Metadata } from "next";
import { Suspense } from "react";

import { Celula, Tabela } from "@/components/admin/tabela";
import { listarPedidosDoAdmin, type StatusPedido } from "@/dados";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Financeiro", robots: { index: false, follow: false } };

const STATUS: Record<StatusPedido, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  expirado: "Expirado",
  cancelado: "Cancelado",
  estornado: "Estornado",
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
  const pedidos = await listarPedidosDoAdmin();

  return (
    <Tabela
      colunas={[
        { rotulo: "Pedido em" },
        { rotulo: "Comprador" },
        { rotulo: "Vendedores" },
        { rotulo: "Pagamento" },
        { rotulo: "Status" },
        { rotulo: "Total", direita: true },
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
                <span className="text-xs text-muted-foreground">{formatarDataEHora(p.pagoEm)}</span>
              )}
            </span>
          </Celula>
          <Celula direita forte>
            {formatarPreco(p.totalCentavos)}
          </Celula>
        </tr>
      ))}
    </Tabela>
  );
}
