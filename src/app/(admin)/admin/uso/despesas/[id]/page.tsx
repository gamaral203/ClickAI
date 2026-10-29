import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { z } from "zod";

import { AcoesCobranca, FormularioCobranca } from "@/components/admin/financeiro/cobrancas";
import { Celula, CartaoNumero, Tabela } from "@/components/admin/tabela";
import { buttonVariants } from "@/components/ui/button";
import { buscarAssinatura, lerConfiguracoesGestao, listarCobrancas } from "@/dados";
import {
  cobrancaNoFormulario,
  custoDaCobranca,
  resumirDespesas,
  ROTULO_STATUS_COBRANCA,
  textoCotacao,
} from "@/lib/financeiro-plataforma";
import { formatarPreco } from "@/lib/formatar";
import {
  formatarDia,
  formatarMoeda,
  hojeEmBrasilia,
  ROTULO_CATEGORIA,
  ROTULO_CICLO,
} from "@/lib/painel-de-uso";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = {
  title: "Histórico da despesa",
  robots: { index: false, follow: false },
};

type Busca = Record<string, string | string[] | undefined>;

export default function PaginaHistoricoDespesa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/uso"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Gastos e uso
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  const caminho = "/admin/uso";
  await exigirGestor(caminho);
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const despesa = await buscarAssinatura(id.data);
  if (!despesa) notFound();
  await connection();
  const busca = await searchParams;
  const [cobrancas, config] = await Promise.all([
    listarCobrancas({ assinaturaId: despesa.id }),
    lerConfiguracoesGestao(),
  ]);
  const aqui = `/admin/uso/despesas/${despesa.id}`;
  const editarId = typeof busca.editar === "string" ? busca.editar : "";
  const editando = cobrancas.find((c) => c.id === editarId);
  const nova = busca.nova === "1";
  const resumo = resumirDespesas(cobrancas);
  const reservas =
    resumo.pendentesCentavos + resumo.previstasCentavos + resumo.provisionadasCentavos;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{despesa.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {ROTULO_CATEGORIA[despesa.categoria]}
          {despesa.plano && ` · ${despesa.plano}`} ·{" "}
          {formatarMoeda(despesa.valorCentavos, despesa.moeda)} {ROTULO_CICLO[despesa.ciclo]} ·{" "}
          {despesa.ativa ? "ativa" : "inativa"}
          {despesa.renovaEm && ` · renova em ${formatarDia(despesa.renovaEm)}`}
        </p>
        {despesa.observacoes && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{despesa.observacoes}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <CartaoNumero
          icone={null}
          titulo="Pago (total)"
          valor={formatarPreco(resumo.pagasCentavos)}
        />
        <CartaoNumero
          icone={null}
          titulo="Reservas (não pagas)"
          valor={formatarPreco(reservas)}
          texto="Pendentes, previstas e provisionadas: fora do pago"
        />
      </div>

      <div className="flex flex-col gap-3">
        {!(nova || editando) && (
          <Link
            href={`${aqui}?nova=1`}
            scroll={false}
            className={buttonVariants({ size: "touch", className: "w-fit" })}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Lançar cobrança
          </Link>
        )}
        {(nova || editando) && (
          <FormularioCobranca
            key={editando?.id ?? "nova"}
            assinaturaId={despesa.id}
            cobranca={editando ? cobrancaNoFormulario(editando) : undefined}
            voltar={aqui}
            hoje={hojeEmBrasilia()}
            moedaPadrao={despesa.moeda}
            cotacaoReferencia={textoCotacao(config.cotacaoDezMilesimos)}
          />
        )}
        <Tabela
          vazio="Nenhuma cobrança lançada."
          colunas={[
            { rotulo: "Data" },
            { rotulo: "Situação" },
            { rotulo: "Valor", direita: true },
            { rotulo: "Cotação", direita: true },
            { rotulo: "IOF/câmbio", direita: true },
            { rotulo: "Custo em R$", direita: true },
            { rotulo: "Observação" },
            { rotulo: "Ações" },
          ]}
        >
          {[...cobrancas].reverse().map((c) => (
            <tr key={c.id}>
              <Celula>{formatarDia(c.data)}</Celula>
              <Celula>
                {ROTULO_STATUS_COBRANCA[c.status]}
                {c.pagoPeloSaldoMp && (
                  <span className="ml-1 text-xs text-muted-foreground">(saldo MP)</span>
                )}
              </Celula>
              <Celula direita>{formatarMoeda(c.valorCentavos, c.moeda)}</Celula>
              <Celula direita>
                {c.cotacaoDezMilesimos ? textoCotacao(c.cotacaoDezMilesimos) : "—"}
              </Celula>
              <Celula direita>{formatarPreco(c.iofCentavos)}</Celula>
              <Celula direita forte>
                {formatarPreco(custoDaCobranca(c))}
              </Celula>
              <Celula>
                <span className="text-xs [overflow-wrap:anywhere]">{c.observacao || "—"}</span>
              </Celula>
              <Celula>
                <AcoesCobranca
                  id={c.id}
                  assinaturaId={despesa.id}
                  editar={`${aqui}?editar=${c.id}`}
                />
              </Celula>
            </tr>
          ))}
        </Tabela>
      </div>
    </>
  );
}
