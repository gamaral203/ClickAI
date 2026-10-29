import Link from "next/link";
import { ArrowDownUp, Calculator, History, ReceiptText, Scale } from "lucide-react";

import { CartaoNumero } from "@/components/admin/tabela";
import {
  cobrancaNoFormulario,
  cobrancaVencida,
  custoDaCobranca,
  ROTULO_STATUS_COBRANCA,
  textoCotacao,
  textoPb,
  type PeriodoFinanceiro,
} from "@/lib/financeiro-plataforma";
import { formatarPreco as preco } from "@/lib/formatar";
import { formatarDia, formatarMoeda } from "@/lib/painel-de-uso";
import type { ContasAPagar as Contas, PainelFinanceiro } from "@/servicos/financeiro-plataforma";

import { hrefFinanceiro } from "./abas";
import { MarcarComoPaga } from "./cobrancas";
import { Linha } from "./conciliacao";

// Aba Resumo do Financeiro: quatro números em linguagem simples, a conta por trás deles (recolhida),
// as contas a pagar e o saldo do Mercado Pago em poucas linhas.

export function Resumo({
  painel,
  periodo,
  contas,
  hoje,
}: {
  painel: PainelFinanceiro;
  periodo: PeriodoFinanceiro;
  contas: Contas;
  hoje: string;
}) {
  return (
    <>
      <Numeros painel={painel} periodo={periodo} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ContasAPagar contas={contas} hoje={hoje} />
        <SaldoDoMercadoPago painel={painel} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Os quatro números

function Numeros({ painel, periodo }: { painel: PainelFinanceiro; periodo: PeriodoFinanceiro }) {
  const { vendas: v, despesas: d } = painel;
  const icone = (I: typeof Scale) => <I aria-hidden="true" className="size-4" />;
  return (
    <section aria-labelledby="titulo-numeros" className="flex flex-col gap-3">
      <h2 id="titulo-numeros" className="sr-only">
        Números de {periodo.rotulo}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <CartaoNumero
          icone={icone(ArrowDownUp)}
          titulo="Vendido"
          valor={preco(v.volumeBrutoCentavos)}
          texto={`O que os compradores pagaram em ${v.pedidosPagos} pedido(s)`}
        />
        <CartaoNumero
          icone={icone(Calculator)}
          titulo="Ficou para a ClicouAí"
          valor={preco(v.receitaLiquidaCentavos)}
          texto="Depois da parte dos fotógrafos e da taxa do Mercado Pago"
        />
        <CartaoNumero
          icone={icone(ReceiptText)}
          titulo="Gastos"
          valor={preco(d.pagasCentavos)}
          texto="Despesas pagas no período"
        />
        <CartaoNumero
          icone={icone(Scale)}
          titulo="Sobrou"
          valor={preco(painel.resultadoCentavos)}
          texto="O que ficou menos os gastos. Não é o caixa."
        />
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <Detalhamento painel={painel} />
        <ComoLer />
      </div>
    </section>
  );
}

/** A conta por trás dos quatro números, recolhida. */
function Detalhamento({ painel }: { painel: PainelFinanceiro }) {
  const { vendas: v, despesas: d, config } = painel;
  const reservas = d.pendentesCentavos + d.previstasCentavos + d.provisionadasCentavos;
  const fora = [
    v.estornados.pedidos > 0 &&
      `${v.estornados.pedidos} estornado(s), ${preco(v.estornados.centavos)}`,
    v.contestados.pedidos > 0 &&
      `${v.contestados.pedidos} em contestação, ${preco(v.contestados.centavos)}`,
  ].filter(Boolean);
  return (
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-4 py-3 font-semibold">Ver a conta completa</summary>
      <div className="flex flex-col gap-3 border-t px-4 pb-4">
        <dl className="flex flex-col divide-y">
          <Linha
            rotulo="Vendido (volume bruto)"
            valor={preco(v.volumeBrutoCentavos)}
            nota={`Faturamento, não receita.${fora.length ? ` Fora: ${fora.join("; ")}.` : ""}`}
          />
          <Linha
            rotulo="Parte dos fotógrafos (repasse)"
            valor={preco(v.repasseSacadoCentavos + v.repasseASacarCentavos)}
            nota={`Sacado ${preco(v.repasseSacadoCentavos)} · a sacar ${preco(v.repasseASacarCentavos)} (estimado)`}
          />
          <Linha
            rotulo="Taxas do Mercado Pago (total)"
            valor={preco(v.taxaGatewayCentavos)}
            nota={`${v.taxasReais} real(is), ${v.taxasEstimadas} estimada(s). No cartão, o comprador e o fotógrafo já pagam a taxa.`}
          />
          <Linha
            rotulo="Receita bruta da ClicouAí"
            valor={preco(v.receitaBrutaCentavos)}
            nota={`Comissão realizada ${preco(v.comissaoRealizadaCentavos)} · a realizar ${preco(v.comissaoARealizarCentavos)} (estimada) · antecipação ${preco(v.taxaAntecipacaoCentavos)}`}
          />
          <Linha
            rotulo="(−) Taxa do Mercado Pago paga pela ClicouAí"
            valor={preco(v.taxaAbsorvidaCentavos)}
          />
          <Linha
            rotulo="= Ficou para a ClicouAí (receita líquida)"
            valor={preco(v.receitaLiquidaCentavos)}
            forte
          />
          <Linha
            rotulo="(−) Gastos (despesas pagas)"
            valor={preco(d.pagasCentavos)}
            nota={
              reservas > 0
                ? `Fora do total: ${preco(reservas)} em reservas (pendentes, previstas, provisionadas)`
                : "Sem reservas no período"
            }
          />
          <Linha
            rotulo="= Sobrou (resultado operacional)"
            valor={preco(painel.resultadoCentavos)}
            forte
          />
        </dl>
        <p className="text-xs text-muted-foreground">
          Taxa do Mercado Pago: real quando lida no pagamento; estimada (Pix{" "}
          {textoPb(config.taxas.pixPb)}, cartão {textoPb(config.taxas.cartaoPb)}) nos pedidos sem o
          valor real, inclusive os anteriores a esta versão. Comissão “a realizar” usa o % atual de
          cada fotógrafo; a realizada usa o valor gravado em cada saque. Vendas pela data do
          pagamento; despesas pela data da cobrança.
        </p>
      </div>
    </details>
  );
}

/** O que era a legenda fixa: ajuda curta, recolhida. */
function ComoLer() {
  return (
    <details className="text-muted-foreground">
      <summary className="w-fit cursor-pointer px-1 text-sm underline-offset-4 hover:underline">
        Como ler estes números
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-sm">
        <li>
          <b className="text-foreground">Vendido</b> (faturamento): tudo o que os compradores
          pagaram. A maior parte é dos fotógrafos.
        </li>
        <li>
          <b className="text-foreground">Receita bruta</b>: a comissão da plataforma (a já cobrada
          nos saques, com o % gravado, mais a estimada do que ainda não foi sacado) e a taxa de
          antecipação.
        </li>
        <li>
          <b className="text-foreground">Ficou para a ClicouAí</b> (receita líquida): a receita
          bruta menos a taxa do Mercado Pago que a plataforma absorve (no Pix, toda; no cartão, o
          comprador e o fotógrafo já pagam a taxa).
        </li>
        <li>
          <b className="text-foreground">Sobrou</b> (resultado operacional): o que ficou menos as
          despesas pagas. Não é o caixa.
        </li>
        <li>
          <b className="text-foreground">Saldo</b> (caixa): o que está na conta do Mercado Pago,
          informado à mão; inclui o dinheiro dos fotógrafos ainda não sacado.
        </li>
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------- Contas a pagar

function ContasAPagar({ contas, hoje }: { contas: Contas; hoje: string }) {
  const n = contas.cobrancas.length;
  return (
    <section aria-labelledby="titulo-contas" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-contas" className="text-xl font-semibold">
          Contas a pagar
        </h2>
        {n > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {preco(contas.totalCentavos)}
            </span>{" "}
            em {n} {n === 1 ? "conta" : "contas"}
            {contas.vencidas > 0 &&
              ` · ${contas.vencidas} vencida(s), ${preco(contas.vencidasCentavos)}`}
          </p>
        )}
      </div>
      {n === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma conta a pagar: tudo em dia. As cobranças pendentes, previstas e provisionadas das
          despesas aparecem aqui.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {contas.cobrancas.map((c) => {
            const vencida = cobrancaVencida(c, hoje);
            return (
              <li
                key={c.id}
                className={`flex flex-col gap-2 p-3 sm:p-4 ${vencida ? "border-l-2 border-l-destructive/60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-medium [overflow-wrap:anywhere]">{c.assinaturaNome}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarDia(c.data)} · {ROTULO_STATUS_COBRANCA[c.status]}
                      {vencida && <span className="font-medium text-destructive"> · vencida</span>}
                      {c.pagoPeloSaldoMp && " · saldo MP"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end text-right tabular-nums">
                    <span className="font-semibold">{preco(custoDaCobranca(c))}</span>
                    {c.moeda === "USD" && (
                      <span className="text-xs text-muted-foreground">
                        {formatarMoeda(c.valorCentavos, "USD")}
                        {c.cotacaoDezMilesimos && ` × ${textoCotacao(c.cotacaoDezMilesimos)}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <MarcarComoPaga
                    assinaturaId={c.assinaturaId}
                    cobranca={cobrancaNoFormulario(c)}
                    hoje={hoje}
                  />
                  <Link
                    href={`/admin/uso/despesas/${c.assinaturaId}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <History aria-hidden="true" className="size-4" />
                    Histórico
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Valor diferente do previsto? Ajuste a cobrança no histórico da despesa antes de marcar como
        paga.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Saldo do Mercado Pago

function SaldoDoMercadoPago({ painel }: { painel: PainelFinanceiro }) {
  const c = painel.conciliacao;
  return (
    <section
      aria-labelledby="titulo-saldo"
      className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <h2 id="titulo-saldo" className="text-lg font-semibold">
        Saldo do Mercado Pago
      </h2>
      <dl className="flex flex-col divide-y text-sm">
        <Linha
          rotulo="Deveria ter"
          valor={preco(c.saldoCalculadoCentavos)}
          nota={
            c.saldoInformado
              ? `Calculado até ${formatarDia(c.saldoInformado.dia)}`
              : "Calculado até agora"
          }
        />
        <Linha
          rotulo="Tem"
          valor={c.saldoInformado ? preco(c.saldoInformado.centavos) : "—"}
          nota={
            c.saldoInformado
              ? `Informado para ${formatarDia(c.saldoInformado.dia)}`
              : "Ainda não informado"
          }
        />
        <Linha
          rotulo="Diferença"
          valor={c.diferencaCentavos === null ? "—" : preco(c.diferencaCentavos)}
          forte
        />
      </dl>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href={hrefFinanceiro("conciliacao")}
          className="font-medium text-primary hover:underline"
        >
          Ver a conciliação
        </Link>
        <Link href={hrefFinanceiro("ajustes")} className="font-medium text-primary hover:underline">
          {c.saldoInformado ? "Atualizar o saldo" : "Informar o saldo"}
        </Link>
      </div>
    </section>
  );
}
