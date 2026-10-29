import Link from "next/link";

import { Celula, Tabela } from "@/components/admin/tabela";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarDataCurta, formatarPreco } from "@/lib/formatar";
import { CAMINHO_FINANCEIRO, type PainelFinanceiro } from "@/servicos/financeiro-plataforma";

// Aba Pedidos do Financeiro: os pedidos do período e "Abrir pedido" pelo id.

const preco = formatarPreco;

const ROTULO_ORIGEM = {
  mp: "real",
  estimada: "estimada",
  estimada_na_leitura: "estimada",
} as const;

export function Pedidos({ painel }: { painel: PainelFinanceiro }) {
  return (
    <section aria-labelledby="titulo-pedidos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="titulo-pedidos" className="text-xl font-semibold">
          Pedidos do período
        </h2>
        <form method="get" className="flex w-full items-end gap-2 sm:w-auto">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="abrir-pedido">Abrir pedido (id)</Label>
            <Input
              id="abrir-pedido"
              name="pedido"
              placeholder="00000000-0000-…"
              autoComplete="off"
              className="h-10 w-full sm:w-72"
            />
          </div>
          <Button type="submit" variant="outline">
            Abrir
          </Button>
        </form>
      </div>
      <Tabela
        vazio="Nenhum pedido pago no período."
        colunas={[
          { rotulo: "Pedido" },
          { rotulo: "Pago em" },
          { rotulo: "Comprador pagou", direita: true },
          { rotulo: "Taxa MP", direita: true },
          { rotulo: "Receita líquida", direita: true },
        ]}
      >
        {painel.pedidos.map((x) => (
          <tr key={x.id}>
            <Celula>
              <Link
                href={`${CAMINHO_FINANCEIRO}/pedido/${x.id}`}
                className="font-mono text-xs hover:underline"
              >
                {x.id.slice(0, 8)}
              </Link>{" "}
              <span className="text-xs text-muted-foreground">
                {x.metodo === "pix" ? "Pix" : "Cartão"}
                {x.status !== "pago" && ` · ${x.status}`}
              </span>
            </Celula>
            <Celula>{formatarDataCurta(x.pagoEm)}</Celula>
            <Celula direita>{preco(x.d.compradorPagouCentavos)}</Celula>
            <Celula direita>
              {x.d.situacao === "receita"
                ? `${preco(x.d.taxaGatewayCentavos)} (${ROTULO_ORIGEM[x.d.taxaOrigem]})`
                : "—"}
            </Celula>
            <Celula direita forte>
              {x.d.situacao === "receita" ? preco(x.d.receitaLiquidaCentavos) : "fora da receita"}
            </Celula>
          </tr>
        ))}
      </Tabela>
      {painel.pedidos.length >= 50 && (
        <p className="text-xs text-muted-foreground">Mostrando os 50 mais recentes do período.</p>
      )}
    </section>
  );
}
