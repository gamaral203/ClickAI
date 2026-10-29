import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";

import {
  ABAS_FINANCEIRO,
  AbasDoFinanceiro,
  hrefFinanceiro,
  type AbaFinanceiro,
  type FiltroNaUrl,
} from "@/components/admin/financeiro/abas";
import { Ajustes } from "@/components/admin/financeiro/ajustes";
import { Conciliacao } from "@/components/admin/financeiro/conciliacao";
import { Pedidos } from "@/components/admin/financeiro/pedidos";
import { Relatorios } from "@/components/admin/financeiro/relatorios";
import { Resumo } from "@/components/admin/financeiro/resumo";
import { AbasDoPainelDeUso } from "@/components/admin/painel-de-uso/abas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lerConfiguracoesGestao } from "@/dados";
import {
  PERIODOS,
  ROTULO_PERIODO,
  periodoFinanceiro,
  type PeriodoFinanceiro,
  type TipoPeriodo,
} from "@/lib/financeiro-plataforma";
import { hojeEmBrasilia } from "@/lib/painel-de-uso";
import {
  CAMINHO_FINANCEIRO,
  lerContasAPagar,
  lerPainelFinanceiro,
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

/** Abas que dependem do período (as outras não mostram o filtro). */
const COM_PERIODO: AbaFinanceiro[] = ["resumo", "relatorios", "pedidos"];

export default function PaginaFinanceiro({ searchParams }: PageProps<"/admin/uso/financeiro">) {
  return (
    <div className="flex flex-col gap-6">
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

  const aba: AbaFinanceiro = ABAS_FINANCEIRO.find((a) => a === p.aba) ?? "resumo";
  const tipo: TipoPeriodo = PERIODOS.find((t) => t === p.periodo) ?? "mes";
  const filtro: FiltroNaUrl = { periodo: tipo, de: texto(p.de), ate: texto(p.ate) };
  const agora = await instanteAtual();
  const hoje = hojeEmBrasilia(agora);

  return (
    <>
      <AbasDoFinanceiro atual={aba} filtro={filtro} />
      <ConteudoDaAba aba={aba} filtro={filtro} agora={agora} hoje={hoje} />
    </>
  );
}

async function ConteudoDaAba({
  aba,
  filtro,
  agora,
  hoje,
}: {
  aba: AbaFinanceiro;
  filtro: FiltroNaUrl;
  agora: number;
  hoje: string;
}) {
  // Ajustes só precisa das configurações; as outras abas, dos números do painel.
  if (aba === "ajustes") {
    return <Ajustes config={await lerConfiguracoesGestao()} hoje={hoje} />;
  }
  const periodo = periodoFinanceiro(filtro.periodo, agora, filtro.de ?? "", filtro.ate ?? "");
  const [painel, contas] = await Promise.all([
    lerPainelFinanceiro(periodo, agora),
    aba === "resumo" ? lerContasAPagar(agora) : null,
  ]);
  return (
    <>
      {COM_PERIODO.includes(aba) && (
        <FiltroDePeriodo aba={aba} periodo={periodo} filtro={filtro} hoje={hoje} />
      )}
      {aba === "resumo" && contas && (
        <Resumo painel={painel} periodo={periodo} contas={contas} hoje={hoje} />
      )}
      {aba === "conciliacao" && <Conciliacao painel={painel} hoje={hoje} />}
      {aba === "relatorios" && <Relatorios painel={painel} />}
      {aba === "pedidos" && <Pedidos painel={painel} />}
    </>
  );
}

// ---------------------------------------------------------------- Filtro

/** Filtro compacto: os períodos prontos numa faixa e as datas personalizadas recolhidas. */
function FiltroDePeriodo({
  aba,
  periodo,
  filtro,
  hoje,
}: {
  aba: AbaFinanceiro;
  periodo: PeriodoFinanceiro;
  filtro: FiltroNaUrl;
  hoje: string;
}) {
  return (
    <section aria-label="Período" className="flex flex-col gap-2">
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {PERIODOS.filter((t) => t !== "personalizado").map((t) => (
          <Link
            key={t}
            href={hrefFinanceiro(aba, { periodo: t })}
            scroll={false}
            aria-current={periodo.tipo === t ? "page" : undefined}
            className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm font-semibold ${
              periodo.tipo === t
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted"
            }`}
          >
            {ROTULO_PERIODO[t]}
          </Link>
        ))}
      </nav>
      <details className="text-sm" open={periodo.tipo === "personalizado" || periodo.invalido}>
        <summary className="w-fit cursor-pointer text-muted-foreground">
          {periodo.invalido && "Período personalizado inválido; mostrando o mês atual. "}
          Período: <span className="font-medium text-foreground">{periodo.rotulo}</span> · escolher
          datas
        </summary>
        <form method="get" className="mt-2 flex flex-wrap items-end gap-3">
          {aba !== "resumo" && <input type="hidden" name="aba" value={aba} />}
          <input type="hidden" name="periodo" value="personalizado" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="periodo-de">De</Label>
            <Input
              id="periodo-de"
              type="date"
              name="de"
              defaultValue={filtro.de}
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
              defaultValue={filtro.ate}
              max={hoje}
              className="h-10"
            />
          </div>
          <Button type="submit" variant={periodo.tipo === "personalizado" ? "default" : "outline"}>
            Personalizado
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Horário de Brasília. Vendas pela data do pagamento; despesas pela data da cobrança.
        </p>
      </details>
    </section>
  );
}
