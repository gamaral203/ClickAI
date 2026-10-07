import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock, Wallet } from "lucide-react";

import { extratoDoFotografo } from "@/dados";
import { formatarData, formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Vendas", robots: { index: false, follow: false } };

export default function PaginaVendas() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const FREQUENCIA = { diaria: "todo dia útil", semanal: "toda semana", mensal: "todo mês" };

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/vendas");
  const extrato = await extratoDoFotografo(conta.id);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl border p-5">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet aria-hidden="true" className="size-4" />
            Disponível
          </span>
          <span className="text-3xl font-bold tabular-nums">
            {formatarPreco(extrato.disponivelCentavos)}
          </span>
          <span className="text-sm text-muted-foreground">
            Vai na próxima transferência ({FREQUENCIA[conta.frequenciaRepasse]}).
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border p-5">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock aria-hidden="true" className="size-4" />A receber
          </span>
          <span className="text-3xl font-bold tabular-nums">
            {formatarPreco(extrato.aReceberCentavos)}
          </span>
          <span className="text-sm text-muted-foreground">
            Vendas no cartão ficam disponíveis 30 dias depois; no Pix, na hora.
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Extrato</h2>
        {extrato.lancamentos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Nenhuma venda ainda. Elas aparecem aqui assim que o pagamento é confirmado.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Venda</th>
                  <th className="px-4 py-3 font-medium">Evento</th>
                  <th className="px-4 py-3 font-medium">Disponível em</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {extrato.lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {l.pagoEm ? formatarDataEHora(l.pagoEm) : "—"}
                    </td>
                    <td className="px-4 py-3">{l.eventoTitulo}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {l.liberado ? "Disponível" : formatarData(l.disponivelEm)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold tabular-nums ${l.valorCentavos < 0 ? "text-destructive" : ""}`}
                    >
                      {formatarPreco(l.valorCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Cada linha é a sua parte de um item vendido, já sem a comissão da plataforma. Quando um
          colaborador vende no seu evento, a sua parte como dono também aparece aqui.
        </p>
      </section>
    </>
  );
}
