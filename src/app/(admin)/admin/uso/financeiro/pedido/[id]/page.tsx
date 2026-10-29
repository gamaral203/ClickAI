import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { Celula, Tabela } from "@/components/admin/tabela";
import { textoPb, type DecomposicaoPedido } from "@/lib/financeiro-plataforma";
import { formatarDataCurta, formatarPreco } from "@/lib/formatar";
import { CAMINHO_FINANCEIRO, lerDecomposicaoDoPedido } from "@/servicos/financeiro-plataforma";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Decomposição do pedido",
  robots: { index: false, follow: false },
};

const preco = formatarPreco;

const SITUACAO: Record<DecomposicaoPedido["situacao"], string> = {
  receita: "Pago: entra na receita",
  sem_receita: "Não pago: nunca é receita",
  estornado: "Estornado: o dinheiro voltou ao comprador, fora da receita",
  contestado: "Em contestação (chargeback): fora da receita até o fim da disputa",
};

const ORIGEM = {
  mp: "real, lida no pagamento do Mercado Pago",
  estimada: "estimada na confirmação (o Mercado Pago não informou)",
  estimada_na_leitura: "estimada agora (pedido anterior ao registro da taxa)",
} as const;

export default function PaginaPedidoFinanceiro({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={CAMINHO_FINANCEIRO}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Financeiro da ClicouAí
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  nota,
  forte,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  forte?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 py-2 ${forte ? "font-semibold" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <dt>{rotulo}</dt>
        <dd className="text-right whitespace-nowrap tabular-nums">{valor}</dd>
      </div>
      {nota && <p className="text-xs font-normal text-muted-foreground">{nota}</p>}
    </div>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  await exigirGestor(CAMINHO_FINANCEIRO);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const dados = await lerDecomposicaoDoPedido(id.data);
  if (!dados) notFound();
  const { pedido, decomposicao: d, lancamentos, taxas } = dados;
  const receita = d.situacao === "receita";

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Pedido {pedido.id.slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground">
          {pedido.metodo === "pix" ? "Pix" : "Cartão"} · criado em{" "}
          {formatarDataCurta(pedido.criadoEm)}
          {pedido.status !== "pendente" && ` · pago em ${formatarDataCurta(pedido.pagoEm)}`} ·{" "}
          <span className="font-mono">{pedido.id}</span>
          {pedido.demonstracao && " · pedido de teste (fora dos números da gestão)"}
        </p>
        <p className="text-sm font-medium">{SITUACAO[d.situacao]}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
          <Linha rotulo="Subtotal das fotos" valor={preco(pedido.subtotalCentavos)} />
          <Linha rotulo="(−) Descontos" valor={preco(pedido.descontoCentavos)} />
          <Linha
            rotulo="(+) Acréscimo do cartão (comprador)"
            valor={preco(pedido.acrescimoCartaoCentavos)}
          />
          <Linha rotulo="= Comprador pagou" valor={preco(d.compradorPagouCentavos)} forte />
          {receita && (
            <>
              <Linha
                rotulo="Parte dos fotógrafos (lançamentos)"
                valor={preco(d.parteFotografosCentavos)}
                nota={
                  d.semLancamentos
                    ? "Pedido sem lançamentos: deduzida do total."
                    : "No cartão, já sem a metade da taxa que cabe ao fotógrafo."
                }
              />
              <Linha
                rotulo="Taxa do Mercado Pago"
                valor={preco(d.taxaGatewayCentavos)}
                nota={`${ORIGEM[d.taxaOrigem]}. Referência: Pix ${textoPb(taxas.pixPb)}, cartão ${textoPb(taxas.cartaoPb)}.`}
              />
              <Linha rotulo="Líquido que caiu na conta" valor={preco(d.liquidoRecebidoCentavos)} />
            </>
          )}
        </dl>
        {receita ? (
          <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
            <Linha
              rotulo="Comissão realizada (em saque)"
              valor={preco(d.comissaoRealizadaCentavos)}
              nota="Pelo valor gravado no saque, rateado pelo valor do lançamento."
            />
            <Linha
              rotulo="Comissão a realizar"
              valor={preco(d.comissaoARealizarCentavos)}
              nota="Estimativa: % atual da conta do fotógrafo; sai no próximo saque."
            />
            <Linha rotulo="Taxa de antecipação" valor={preco(d.taxaAntecipacaoCentavos)} />
            <Linha
              rotulo="= Receita bruta da plataforma"
              valor={preco(d.receitaBrutaCentavos)}
              forte
            />
            <Linha
              rotulo="Cobertura da taxa (comprador + fotógrafo)"
              valor={preco(d.coberturaDaTaxaCentavos)}
              nota="No cartão, o acréscimo e a metade do fotógrafo; no Pix, zero."
            />
            <Linha
              rotulo="(−) Taxa absorvida pela plataforma"
              valor={preco(d.taxaAbsorvidaCentavos)}
            />
            <Linha
              rotulo="= Receita líquida da plataforma"
              valor={preco(d.receitaLiquidaCentavos)}
              forte
            />
            <Linha
              rotulo="Repasse sacado / a sacar"
              valor={`${preco(d.repasseSacadoCentavos)} / ${preco(d.repasseASacarCentavos)}`}
            />
          </dl>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Este pedido não gera receita. Pendente, expirado e cancelado nunca foram pagos;
            estornado e contestado são tratados à parte (os lançamentos dos fotógrafos foram
            estornados).
            {pedido.estornadoEm && ` Estornado em ${formatarDataCurta(pedido.estornadoEm)}.`}
            {pedido.contestadoEm && ` Contestado em ${formatarDataCurta(pedido.contestadoEm)}.`}
          </p>
        )}
      </div>

      <section aria-labelledby="titulo-lancamentos" className="flex flex-col gap-3">
        <h2 id="titulo-lancamentos" className="text-lg font-semibold">
          Lançamentos dos fotógrafos
        </h2>
        <Tabela
          vazio="Sem lançamentos."
          colunas={[
            { rotulo: "Fotógrafo" },
            { rotulo: "Valor", direita: true },
            { rotulo: "Saque" },
            { rotulo: "Comissão do saque", direita: true },
          ]}
        >
          {lancamentos.map((l, i) => (
            <tr key={i}>
              <Celula>
                {l.fotografo}
                {l.estorno && <span className="ml-1 text-xs text-muted-foreground">(estorno)</span>}
              </Celula>
              <Celula direita>{preco(l.valorCentavos)}</Celula>
              <Celula>
                {l.saque
                  ? `${l.saque.status} em ${formatarDataCurta(l.saque.criadoEm)}`
                  : `sem saque (comissão atual ${l.comissaoPctAtual}%)`}
              </Celula>
              <Celula direita>
                {l.saque
                  ? `${preco(l.saque.comissaoCentavos)} de ${preco(l.saque.brutoCentavos)}`
                  : "—"}
              </Celula>
            </tr>
          ))}
        </Tabela>
      </section>
    </>
  );
}
