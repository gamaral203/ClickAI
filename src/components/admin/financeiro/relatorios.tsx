import Link from "next/link";
import { Calculator, ReceiptText, Scale, Wallet } from "lucide-react";

import { Celula, CartaoNumero, Tabela } from "@/components/admin/tabela";
import { formatarBytes, formatarPreco } from "@/lib/formatar";
import { CATEGORIAS_ASSINATURA, ROTULO_CATEGORIA } from "@/lib/painel-de-uso";
import type { PainelFinanceiro } from "@/servicos/financeiro-plataforma";

import { BarrasHorizontais, GraficoColunas } from "./graficos";

// Aba Relatórios do Financeiro: evolução mensal, indicadores e a tabela por evento.

const preco = formatarPreco;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26". */
function rotuloMes(mes: string) {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

export function Relatorios({ painel }: { painel: PainelFinanceiro }) {
  return (
    <>
      <Graficos painel={painel} />
      <Indicadores painel={painel} />
      <PorEvento painel={painel} />
    </>
  );
}

// ---------------------------------------------------------------- Gráficos

function Graficos({ painel }: { painel: PainelFinanceiro }) {
  const serie = (campo: keyof Omit<PainelFinanceiro["evolucao"][number], "mes">) =>
    painel.evolucao.map((p) => ({
      rotulo: rotuloMes(p.mes),
      titulo: rotuloMes(p.mes),
      centavos: p[campo],
    }));
  const rotuloCat = (c: string) =>
    CATEGORIAS_ASSINATURA.find((x) => x === c)
      ? ROTULO_CATEGORIA[c as (typeof CATEGORIAS_ASSINATURA)[number]]
      : c;
  return (
    <section aria-labelledby="titulo-graficos" className="flex flex-col gap-3">
      <h2 id="titulo-graficos" className="text-xl font-semibold">
        Evolução mensal (12 meses)
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <GraficoColunas titulo="Volume bruto de vendas" colunas={serie("volumeCentavos")} />
        <GraficoColunas titulo="Receita bruta" colunas={serie("receitaBrutaCentavos")} />
        <GraficoColunas titulo="Taxas do Mercado Pago" colunas={serie("taxasCentavos")} />
        <GraficoColunas titulo="Despesas pagas" colunas={serie("despesasCentavos")} />
        <GraficoColunas titulo="Resultado operacional" colunas={serie("resultadoCentavos")} />
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Custos pagos no período, por categoria</p>
          <BarrasHorizontais
            vazio="Nenhuma despesa paga no período."
            itens={painel.despesas.porCategoria.map((c) => ({
              rotulo: rotuloCat(c.categoria),
              centavos: c.centavos,
            }))}
          />
        </div>
      </div>
      <details className="rounded-xl border bg-card text-sm">
        <summary className="cursor-pointer p-4 font-semibold">Tabela da evolução mensal</summary>
        <div className="border-t p-2">
          <Tabela
            colunas={[
              { rotulo: "Mês" },
              { rotulo: "Volume", direita: true },
              { rotulo: "Receita bruta", direita: true },
              { rotulo: "Taxas MP", direita: true },
              { rotulo: "Receita líquida", direita: true },
              { rotulo: "Despesas pagas", direita: true },
              { rotulo: "Resultado", direita: true },
            ]}
          >
            {painel.evolucao.map((p) => (
              <tr key={p.mes}>
                <Celula>{rotuloMes(p.mes)}</Celula>
                <Celula direita>{preco(p.volumeCentavos)}</Celula>
                <Celula direita>{preco(p.receitaBrutaCentavos)}</Celula>
                <Celula direita>{preco(p.taxasCentavos)}</Celula>
                <Celula direita>{preco(p.receitaLiquidaCentavos)}</Celula>
                <Celula direita>{preco(p.despesasCentavos)}</Celula>
                <Celula direita forte>
                  {preco(p.resultadoCentavos)}
                </Celula>
              </tr>
            ))}
          </Tabela>
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- Indicadores

function Indicadores({ painel }: { painel: PainelFinanceiro }) {
  const i = painel.indicadores;
  const insuficiente = "dados insuficientes";
  return (
    <section aria-labelledby="titulo-indicadores" className="flex flex-col gap-3">
      <h2 id="titulo-indicadores" className="text-xl font-semibold">
        Indicadores
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <CartaoNumero
          icone={<ReceiptText aria-hidden="true" className="size-4" />}
          titulo="Custo operacional mensal"
          valor={
            painel.custoFixoMensalCentavos === null ? "—" : preco(painel.custoFixoMensalCentavos)
          }
          texto="Estimado pelas despesas recorrentes ativas (dólar pela cotação de referência)"
        />
        <CartaoNumero
          icone={<Wallet aria-hidden="true" className="size-4" />}
          titulo="Custo médio por GB"
          valor={i.custoPorGbCentavos === null ? insuficiente : preco(i.custoPorGbCentavos)}
          texto={`Armazenamento mensal ÷ ≈ ${painel.gbArmazenados.toFixed(1).replace(".", ",")} GB guardados (estimado)`}
        />
        <CartaoNumero
          icone={<Calculator aria-hidden="true" className="size-4" />}
          titulo="Receita líquida média por evento"
          valor={
            i.receitaLiquidaMediaPorEventoCentavos === null
              ? insuficiente
              : preco(i.receitaLiquidaMediaPorEventoCentavos)
          }
          texto={`${painel.eventos.length} evento(s) com venda no período`}
        />
        <CartaoNumero
          icone={<Scale aria-hidden="true" className="size-4" />}
          titulo="Eventos para cobrir os custos fixos"
          valor={
            i.eventosParaCobrirCustos === null ? insuficiente : String(i.eventosParaCobrirCustos)
          }
          texto="Por mês, pela média do período (precisa de 3 eventos com venda)"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Por evento

function PorEvento({ painel }: { painel: PainelFinanceiro }) {
  return (
    <section aria-labelledby="titulo-eventos" className="flex flex-col gap-3">
      <h2 id="titulo-eventos" className="text-xl font-semibold">
        Por evento
      </h2>
      <Tabela
        vazio="Nenhuma venda no período."
        colunas={[
          { rotulo: "Evento" },
          { rotulo: "Fotos", direita: true },
          { rotulo: "Armazenamento", direita: true },
          { rotulo: "Vendidas", direita: true },
          { rotulo: "Volume", direita: true },
          { rotulo: "Comissão", direita: true },
          { rotulo: "Taxas MP", direita: true },
          { rotulo: "Receita líquida", direita: true },
        ]}
      >
        {painel.eventos.map((e) => (
          <tr key={e.eventoId}>
            <Celula>
              <Link href={`/admin/eventos/${e.eventoId}`} className="font-medium hover:underline">
                {e.titulo}
              </Link>
            </Celula>
            <Celula direita>{e.fotos.toLocaleString("pt-BR")}</Celula>
            <Celula direita>
              {e.bytesEstimados ? "≈ " : ""}
              {formatarBytes(e.bytes)}
            </Celula>
            <Celula direita>{e.itensVendidos}</Celula>
            <Celula direita>{preco(e.volumeCentavos)}</Celula>
            <Celula direita>{preco(e.receitaBrutaCentavos)}</Celula>
            <Celula direita>{preco(e.taxasCentavos)}</Celula>
            <Celula direita forte>
              {preco(e.receitaLiquidaCentavos)}
            </Celula>
          </tr>
        ))}
      </Tabela>
      <p className="text-xs text-muted-foreground">
        Pedido com itens de mais de um evento: valores rateados pelo valor de cada item (preço −
        desconto). Custos compartilhados (hospedagem, e-mail, armazenamento) não são rateados.
        Armazenamento: originais com o tamanho gravado; “≈” quando há arquivos sem tamanho (contados
        a 8 MB).
      </p>
    </section>
  );
}
