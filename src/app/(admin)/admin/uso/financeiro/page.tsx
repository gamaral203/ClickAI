import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ArrowDownUp,
  Banknote,
  Calculator,
  CreditCard,
  Landmark,
  Percent,
  ReceiptText,
  Scale,
  Wallet,
} from "lucide-react";
import { z } from "zod";

import { BarrasHorizontais, GraficoColunas } from "@/components/admin/financeiro/graficos";
import {
  FormularioReferencias,
  FormularioSaldo,
  ImportarDespesas,
} from "@/components/admin/financeiro/formularios";
import { AbasDoPainelDeUso } from "@/components/admin/painel-de-uso/abas";
import { Celula, CartaoNumero, Tabela } from "@/components/admin/tabela";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centavosParaCampo } from "@/lib/dinheiro";
import {
  PERIODOS,
  ROTULO_PERIODO,
  textoCotacao,
  textoPb,
  periodoFinanceiro,
  type PeriodoFinanceiro,
  type TipoPeriodo,
} from "@/lib/financeiro-plataforma";
import { formatarBytes, formatarDataCurta, formatarPreco } from "@/lib/formatar";
import {
  CATEGORIAS_ASSINATURA,
  formatarDia,
  hojeEmBrasilia,
  ROTULO_CATEGORIA,
} from "@/lib/painel-de-uso";
import {
  CAMINHO_FINANCEIRO,
  lerPainelFinanceiro,
  type PainelFinanceiro,
} from "@/servicos/financeiro-plataforma";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Financeiro da ClicouAí",
  robots: { index: false, follow: false },
};

async function instanteAtual() {
  await connection();
  return Date.now();
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" → "out/26". */
function rotuloMes(mes: string) {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

const preco = formatarPreco;

export default function PaginaFinanceiro({ searchParams }: PageProps<"/admin/uso/financeiro">) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Painel de uso</h1>
        <AbasDoPainelDeUso atual="financeiro" />
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/admin/uso/financeiro">["searchParams"];
}) {
  await exigirGestor(CAMINHO_FINANCEIRO);
  const p = await searchParams;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  // "Abrir pedido": o id digitado leva à decomposição dele.
  const pedido = z.uuid().safeParse(texto(p.pedido).trim());
  if (pedido.success) redirect(`${CAMINHO_FINANCEIRO}/pedido/${pedido.data}`);

  const tipo: TipoPeriodo = PERIODOS.find((t) => t === p.periodo) ?? "mes";
  const agora = await instanteAtual();
  const periodo = periodoFinanceiro(tipo, agora, texto(p.de), texto(p.ate));
  const painel = await lerPainelFinanceiro(periodo, agora);
  const hoje = hojeEmBrasilia(agora);

  return (
    <>
      <FiltroDePeriodo periodo={periodo} de={texto(p.de)} ate={texto(p.ate)} hoje={hoje} />
      <Legenda />
      <Cartoes painel={painel} periodo={periodo} />
      <Conciliacao painel={painel} hoje={hoje} />
      <Graficos painel={painel} />
      <Indicadores painel={painel} />
      <PorEvento painel={painel} />
      <Pedidos painel={painel} />
      <Configuracoes painel={painel} hoje={hoje} />
    </>
  );
}

// ---------------------------------------------------------------- Filtro

function FiltroDePeriodo({
  periodo,
  de,
  ate,
  hoje,
}: {
  periodo: PeriodoFinanceiro;
  de: string;
  ate: string;
  hoje: string;
}) {
  return (
    <section aria-label="Período" className="flex flex-col gap-3">
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {PERIODOS.filter((t) => t !== "personalizado").map((t) => (
          <Link
            key={t}
            href={t === "mes" ? CAMINHO_FINANCEIRO : `${CAMINHO_FINANCEIRO}?periodo=${t}`}
            scroll={false}
            aria-current={periodo.tipo === t ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold ${
              periodo.tipo === t
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted"
            }`}
          >
            {ROTULO_PERIODO[t]}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="periodo" value="personalizado" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodo-de">De</Label>
          <Input
            id="periodo-de"
            type="date"
            name="de"
            defaultValue={de}
            max={hoje}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodo-ate">Até</Label>
          <Input
            id="periodo-ate"
            type="date"
            name="ate"
            defaultValue={ate}
            max={hoje}
            className="h-10"
          />
        </div>
        <Button type="submit" variant={periodo.tipo === "personalizado" ? "default" : "outline"}>
          Personalizado
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {periodo.invalido && "Período personalizado inválido; mostrando o mês atual. "}
        Período: <span className="font-medium text-foreground">{periodo.rotulo}</span> (horário de
        Brasília). Vendas pela data do pagamento; despesas pela data da cobrança.
      </p>
    </section>
  );
}

function Legenda() {
  return (
    <details className="rounded-xl border bg-card text-sm">
      <summary className="cursor-pointer p-4 font-semibold">
        Faturamento ≠ receita ≠ resultado ≠ caixa: como ler
      </summary>
      <ul className="flex list-disc flex-col gap-1 border-t p-4 pl-8 text-muted-foreground">
        <li>
          <b className="text-foreground">Volume bruto de vendas</b> (faturamento): tudo o que os
          compradores pagaram. A maior parte é dos fotógrafos.
        </li>
        <li>
          <b className="text-foreground">Receita bruta</b>: a comissão da plataforma (a já cobrada
          nos saques, com o % gravado, mais a estimada do que ainda não foi sacado) e a taxa de
          antecipação.
        </li>
        <li>
          <b className="text-foreground">Receita líquida</b>: a receita bruta menos a taxa do
          Mercado Pago que a plataforma absorve (no Pix, toda; no cartão, o comprador e o fotógrafo
          já pagam a taxa).
        </li>
        <li>
          <b className="text-foreground">Resultado operacional</b>: receita líquida menos as
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

// ---------------------------------------------------------------- Cartões

function Cartoes({ painel, periodo }: { painel: PainelFinanceiro; periodo: PeriodoFinanceiro }) {
  const { vendas: v, despesas: d, config } = painel;
  const reservas = d.pendentesCentavos + d.previstasCentavos + d.provisionadasCentavos;
  const fora = [
    v.estornados.pedidos > 0 &&
      `${v.estornados.pedidos} estornado(s), ${preco(v.estornados.centavos)}`,
    v.contestados.pedidos > 0 &&
      `${v.contestados.pedidos} em contestação, ${preco(v.contestados.centavos)}`,
  ].filter(Boolean);
  const icone = (I: typeof Wallet) => <I aria-hidden="true" className="size-4" />;
  return (
    <section aria-labelledby="titulo-cartoes" className="flex flex-col gap-3">
      <h2 id="titulo-cartoes" className="text-xl font-semibold">
        {periodo.rotulo}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <CartaoNumero
          icone={icone(ArrowDownUp)}
          titulo="Volume bruto de vendas"
          valor={preco(v.volumeBrutoCentavos)}
          texto={`${v.pedidosPagos} pedido(s) pago(s). Faturamento, não receita.${fora.length ? ` Fora: ${fora.join("; ")}.` : ""}`}
        />
        <CartaoNumero
          icone={icone(Banknote)}
          titulo="Repasse aos fotógrafos"
          valor={preco(v.repasseSacadoCentavos + v.repasseASacarCentavos)}
          texto={`Sacado ${preco(v.repasseSacadoCentavos)} · a sacar ${preco(v.repasseASacarCentavos)} (estimado)`}
        />
        <CartaoNumero
          icone={icone(Percent)}
          titulo="Receita bruta da plataforma"
          valor={preco(v.receitaBrutaCentavos)}
          texto={`Comissão realizada ${preco(v.comissaoRealizadaCentavos)} · a realizar ${preco(v.comissaoARealizarCentavos)} (estimada) · antecipação ${preco(v.taxaAntecipacaoCentavos)}`}
        />
        <CartaoNumero
          icone={icone(CreditCard)}
          titulo="Taxas de pagamento (Mercado Pago)"
          valor={preco(v.taxaGatewayCentavos)}
          texto={`${v.taxasReais} real(is), ${v.taxasEstimadas} estimada(s). Absorvida pela plataforma: ${preco(v.taxaAbsorvidaCentavos)}`}
        />
        <CartaoNumero
          icone={icone(Calculator)}
          titulo="Receita líquida"
          valor={preco(v.receitaLiquidaCentavos)}
          texto="Receita bruta − taxa absorvida"
        />
        <CartaoNumero
          icone={icone(ReceiptText)}
          titulo="Despesas operacionais pagas"
          valor={preco(d.pagasCentavos)}
          texto={
            reservas > 0
              ? `Fora do total: ${preco(reservas)} em reservas (pendentes, previstas, provisionadas)`
              : "Sem reservas no período"
          }
        />
        <CartaoNumero
          icone={icone(Scale)}
          titulo="Resultado operacional"
          valor={preco(painel.resultadoCentavos)}
          texto="Receita líquida − despesas pagas. Não é caixa."
        />
        <CartaoNumero
          icone={icone(Landmark)}
          titulo="Saldo disponível (informado)"
          valor={config.saldoMp ? preco(config.saldoMp.centavos) : "—"}
          texto={
            config.saldoMp
              ? `Informado à mão em ${formatarDia(config.saldoMp.dia)}; inclui o dinheiro dos fotógrafos`
              : "Informe o saldo do Mercado Pago em Configurações, abaixo"
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Taxa do Mercado Pago: real quando lida no pagamento; estimada (Pix{" "}
        {textoPb(config.taxas.pixPb)}, cartão {textoPb(config.taxas.cartaoPb)}) nos pedidos sem o
        valor real, inclusive os anteriores a esta versão. Comissão “a realizar” usa o % atual de
        cada fotógrafo; a realizada usa o valor gravado em cada saque.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Conciliação

function Linha({
  rotulo,
  valor,
  forte,
  nota,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  nota?: string;
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

function Conciliacao({ painel, hoje }: { painel: PainelFinanceiro; hoje: string }) {
  const c = painel.conciliacao;
  const ate = c.saldoInformado ? formatarDia(c.saldoInformado.dia) : "agora";
  return (
    <section aria-labelledby="titulo-conciliacao" className="flex flex-col gap-3">
      <h2 id="titulo-conciliacao" className="text-xl font-semibold">
        Conciliação com o saldo do Mercado Pago
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
          <Linha
            rotulo={`Entradas líquidas até ${ate}`}
            valor={preco(c.entradasLiquidasCentavos)}
            nota="Pedidos pagos, menos a taxa do Mercado Pago (real ou estimada). Estornados e contestados fora."
          />
          <Linha rotulo="(−) Saques pagos aos fotógrafos" valor={preco(c.saquesPagosCentavos)} />
          <Linha
            rotulo="(−) Saques em processamento"
            valor={preco(c.saquesProcessandoCentavos)}
            nota="Podem ainda não ter saído da conta."
          />
          <Linha
            rotulo="(−) Despesas pagas com o saldo do MP"
            valor={preco(c.despesasPagasSaldoCentavos)}
          />
          <Linha
            rotulo="= Saldo conciliado (calculado)"
            valor={preco(c.saldoCalculadoCentavos)}
            forte
          />
          <Linha
            rotulo="Saldo informado"
            valor={c.saldoInformado ? preco(c.saldoInformado.centavos) : "não informado"}
          />
          <Linha
            rotulo="Diferença não justificada"
            valor={c.diferencaCentavos === null ? "—" : preco(c.diferencaCentavos)}
            forte
            nota={
              c.diferencaCentavos === null
                ? "Informe o saldo para comparar."
                : "Informado − calculado. Taxas estimadas, saques manuais fora do Payouts ou despesas não lançadas explicam diferenças."
            }
          />
        </dl>
        <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
          <Linha
            rotulo="Do saldo calculado, dos fotógrafos (a sacar)"
            valor={preco(c.aSacarFotografosCentavos)}
            nota="Vendas sem saque, menos a comissão que o saque cobrará (estimada)."
          />
          <Linha
            rotulo="Do saldo calculado, da plataforma"
            valor={preco(c.saldoDaPlataformaCentavos)}
            forte
          />
          <Linha
            rotulo={`Receita líquida acumulada até ${ate}`}
            valor={preco(painel.acumulado.receitaLiquidaCentavos)}
          />
          <Linha
            rotulo="Despesas pagas acumuladas (todas as formas)"
            valor={preco(painel.acumulado.despesasPagasCentavos)}
            nota="As pagas no cartão não saem do saldo do Mercado Pago."
          />
          <Linha
            rotulo="Reservas no saldo do MP (não subtraídas)"
            valor={preco(c.despesasReservadasSaldoCentavos)}
            nota="Pendentes, previstas e provisionadas marcadas para o saldo. Nunca misturadas com o pago."
          />
          <Linha
            rotulo="Saldo calculado após as reservas"
            valor={preco(c.saldoAposReservasCentavos)}
          />
        </dl>
      </div>
      <p className="text-xs text-muted-foreground">
        Hoje: {formatarDia(hoje)}. A conciliação vai do início até o fim do dia do saldo informado.
      </p>
    </section>
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

// ---------------------------------------------------------------- Pedidos

const ROTULO_ORIGEM = {
  mp: "real",
  estimada: "estimada",
  estimada_na_leitura: "estimada",
} as const;

function Pedidos({ painel }: { painel: PainelFinanceiro }) {
  return (
    <section aria-labelledby="titulo-pedidos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="titulo-pedidos" className="text-xl font-semibold">
          Pedidos do período
        </h2>
        <form method="get" className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="abrir-pedido">Abrir pedido (id)</Label>
            <Input
              id="abrir-pedido"
              name="pedido"
              placeholder="00000000-0000-…"
              autoComplete="off"
              className="h-10 w-72 max-w-full"
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

// ---------------------------------------------------------------- Configurações

function Configuracoes({ painel, hoje }: { painel: PainelFinanceiro; hoje: string }) {
  const { config } = painel;
  return (
    <section aria-labelledby="titulo-config" className="flex flex-col gap-3">
      <h2 id="titulo-config" className="text-xl font-semibold">
        Configurações e despesas
      </h2>
      <details className="rounded-xl border bg-card" open={!config.saldoMp}>
        <summary className="cursor-pointer p-4 font-semibold">
          Saldo informado do Mercado Pago
          {config.saldoMp && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {preco(config.saldoMp.centavos)} em {formatarDia(config.saldoMp.dia)} (salvo em{" "}
              {formatarDataCurta(config.saldoMp.atualizadoEm)})
            </span>
          )}
        </summary>
        <div className="border-t p-4">
          <FormularioSaldo
            valor={config.saldoMp ? centavosParaCampo(config.saldoMp.centavos) : ""}
            dia={config.saldoMp?.dia ?? ""}
            hoje={hoje}
          />
        </div>
      </details>
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer p-4 font-semibold">
          Taxas de referência e cotação
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            Pix {textoPb(config.taxas.pixPb)} · cartão {textoPb(config.taxas.cartaoPb)} · US$ 1 = R${" "}
            {textoCotacao(config.cotacaoDezMilesimos)}
          </span>
        </summary>
        <div className="border-t p-4">
          <FormularioReferencias
            pix={textoPb(config.taxas.pixPb).replace("%", "")}
            cartao={textoPb(config.taxas.cartaoPb).replace("%", "")}
            cotacao={textoCotacao(config.cotacaoDezMilesimos)}
          />
        </div>
      </details>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">Despesas</p>
        <p className="text-sm text-muted-foreground">
          As despesas ficam em{" "}
          <Link href="/admin/uso" className="font-medium text-primary hover:underline">
            Gastos e uso
          </Link>
          ; cada uma tem o histórico de cobranças (botão “Histórico”). Para começar, importe as
          despesas informadas pelos donos:
        </p>
        <ImportarDespesas />
      </div>
    </section>
  );
}
