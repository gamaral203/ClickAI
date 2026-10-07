import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clock, Hourglass, Wallet } from "lucide-react";

import { BotoesSaque } from "@/components/painel/botoes-saque";
import type { Saque } from "@/dados";
import { formatarCpfCnpj } from "@/lib/documentos";
import { formatarData, formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { chavePixValida, SAQUE_MINIMO_CENTAVOS, situacaoFinanceira } from "@/servicos/saques";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Vendas", robots: { index: false, follow: false } };

export default function PaginaVendas() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Vendas e saques</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const STATUS_SAQUE: Record<Saque["status"], string> = {
  processando: "Processando",
  pago: "Pago",
  falhou: "Não realizado",
};

function CartaoSaldo({
  icone,
  titulo,
  valor,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  texto: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icone}
        {titulo}
      </span>
      <span className="text-3xl font-bold tabular-nums">{formatarPreco(valor)}</span>
      <span className="text-sm text-muted-foreground">{texto}</span>
    </div>
  );
}

async function Conteudo() {
  const { conta } = await exigirFotografo("/painel/vendas");
  const { agora, lancamentos, saques, saldo } = await situacaoFinanceira(conta);
  const temChave = chavePixValida(conta);
  const emAndamento = saques.some((s) => s.status === "processando");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <CartaoSaldo
          icone={<Wallet aria-hidden="true" className="size-4" />}
          titulo="Disponível"
          valor={saldo.disponivelCentavos}
          texto="Vendas com 30 dias ou mais."
        />
        <CartaoSaldo
          icone={<Hourglass aria-hidden="true" className="size-4" />}
          titulo="Antecipável"
          valor={saldo.antecipavelCentavos}
          texto="Vendas entre 1 e 30 dias: dá para sacar com 1% a mais."
        />
        <CartaoSaldo
          icone={<Clock aria-hidden="true" className="size-4" />}
          titulo="A liberar"
          valor={saldo.aLiberarCentavos}
          texto="Vendas de hoje: liberam amanhã."
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Sacar</h2>
        {temChave ? (
          <p className="text-sm text-muted-foreground">
            O Pix vai para a sua chave {formatarCpfCnpj(conta.chavePix ?? "")}. Os valores abaixo
            são brutos; a taxa da plataforma sai no saque.
          </p>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm">
            Para sacar, confirme sua chave Pix em{" "}
            <Link href="/painel/perfil" className="font-medium text-primary underline">
              Perfil e recebimento
            </Link>
            .
          </p>
        )}
        {emAndamento && (
          <p role="status" className="text-sm font-medium">
            Há um saque em processamento. Um novo saque fica liberado quando ele terminar.
          </p>
        )}
        <BotoesSaque
          normal={saldo.normal}
          antecipado={saldo.antecipado}
          podeSacar={temChave && !emAndamento}
          minimoCentavos={SAQUE_MINIMO_CENTAVOS}
        />
      </section>

      {saques.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Saques</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Pedido em</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Bruto</th>
                  <th className="px-4 py-3 text-right font-medium">Taxas</th>
                  <th className="px-4 py-3 text-right font-medium">Recebido</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {saques.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatarDataEHora(s.criadoEm)}</td>
                    <td className="px-4 py-3">{s.antecipado ? "Antecipado" : "Normal"}</td>
                    <td className="px-4 py-3">{STATUS_SAQUE[s.status]}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatarPreco(s.brutoCentavos)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      − {formatarPreco(s.taxaCentavos)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatarPreco(s.liquidoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Extrato</h2>
        {lancamentos.length === 0 ? (
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
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 text-right font-medium">Valor bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {l.pagoEm ? formatarDataEHora(l.pagoEm) : "—"}
                    </td>
                    <td className="px-4 py-3">{l.eventoTitulo}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{situacao(l, agora)}</td>
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
          Cada linha é a sua parte de um item vendido, antes da taxa da plataforma. Quando um
          colaborador vende no seu evento, a sua parte como dono também aparece aqui.
        </p>
      </section>
    </>
  );
}

function situacao(
  l: { saqueId: string | null; disponivelEm: string; antecipavelEm: string },
  agora: number,
) {
  if (l.saqueId) return "Sacado";
  if (new Date(l.disponivelEm).getTime() <= agora) return "Disponível";
  if (new Date(l.antecipavelEm).getTime() <= agora) {
    return `Antecipável · livre em ${formatarData(l.disponivelEm)}`;
  }
  return `Libera em ${formatarData(l.antecipavelEm)}`;
}
