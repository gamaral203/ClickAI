import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { BotaoImprimir } from "@/components/painel/botao-imprimir";
import { relatorioDoEvento } from "@/dados";
import {
  formatarPeriodo,
  formatarDataEHora,
  formatarPorcentagem,
  formatarPreco,
} from "@/lib/formatar";
import { ehIdValido } from "@/lib/validacao";
import { exigirFotografo } from "@/servicos/sessao";

// Relatório do evento para guardar ou mandar a quem contratou: página feita para imprimir, e o
// "Baixar PDF" usa o "Salvar como PDF" do próprio navegador (sem gerar arquivo no servidor).

export const metadata: Metadata = {
  title: "Relatório do evento",
  robots: { index: false, follow: false },
};

export default function PaginaRelatorio(props: PageProps<"/painel/eventos/[id]/relatorio">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Conteudo {...props} />
    </Suspense>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="flex break-inside-avoid flex-col gap-1 rounded-xl border p-4">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className="text-2xl font-bold tabular-nums">{valor}</span>
      {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
    </div>
  );
}

/** Parte ÷ todo em porcentagem; "—" quando não há base (todo zero). */
function porcento(parte: number, todo: number) {
  return formatarPorcentagem(todo ? parte / todo : null);
}

async function Conteudo({ params }: PageProps<"/painel/eventos/[id]/relatorio">) {
  const { id } = await params;
  const { conta } = await exigirFotografo(`/painel/eventos/${id}/relatorio`);
  const relatorio = ehIdValido(id) ? await relatorioDoEvento(id, conta.id) : null;
  if (!relatorio) notFound();
  const { evento } = relatorio;

  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/painel/eventos/${evento.id}`}
          className="inline-flex h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar ao evento
        </Link>
        <BotaoImprimir />
      </div>

      <header className="flex flex-col gap-1 border-b pb-4">
        <p className="text-sm font-medium text-primary">ClicouAí · Relatório do evento</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{evento.titulo}</h1>
        <p className="text-muted-foreground">
          {formatarPeriodo(evento.inicioEm, evento.fimEm)} · {evento.local}, {evento.cidade}/
          {evento.estado}
        </p>
        <p className="text-xs text-muted-foreground">
          {conta.nomePublico} · gerado em {formatarDataEHora(relatorio.geradoEm)}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Vendas</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
          <Numero rotulo="Faturamento" valor={formatarPreco(relatorio.faturamentoCentavos)} />
          <Numero
            rotulo="Sua parte"
            valor={formatarPreco(relatorio.parteDoFotografoCentavos)}
            detalhe="Bruta, antes dos saques"
          />
          <Numero
            rotulo="Pedidos"
            valor={String(relatorio.pedidos)}
            detalhe={`${relatorio.porMetodo.pix} Pix · ${relatorio.porMetodo.cartao} cartão`}
          />
          <Numero
            rotulo="Ticket médio"
            valor={formatarPreco(relatorio.ticketMedioCentavos)}
            detalhe={`${relatorio.itensVendidos} itens vendidos`}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Fotos e público</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
          <Numero rotulo="Fotos publicadas" valor={String(relatorio.fotosPublicadas)} />
          <Numero
            rotulo="Fotos com rosto"
            valor={String(relatorio.fotosComRosto)}
            detalhe={`${porcento(relatorio.fotosComRosto, relatorio.fotosPublicadas)} das fotos`}
          />
          <Numero rotulo="Visitas" valor={String(relatorio.visitas)} />
          <Numero
            rotulo="Conversão"
            valor={porcento(relatorio.pedidos, relatorio.visitas)}
            detalhe={`${relatorio.carrinhos} adições ao carrinho`}
          />
        </div>
      </section>

      <section className="flex break-inside-avoid flex-col gap-3">
        <h2 className="text-lg font-semibold">Vendas por dia</h2>
        {relatorio.porDia.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma venda ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Dia</th>
                <th className="py-2 text-right font-medium">Pedidos</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {relatorio.porDia.map((d) => (
                <tr key={d.dia} className="border-b last:border-0">
                  <td className="py-2">{d.dia.split("-").reverse().join("/")}</td>
                  <td className="py-2 text-right tabular-nums">{d.pedidos}</td>
                  <td className="py-2 text-right tabular-nums">{formatarPreco(d.valorCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {relatorio.maisVendidas.length > 0 && (
        <section className="flex break-inside-avoid flex-col gap-3">
          <h2 className="text-lg font-semibold">Fotos mais vendidas</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 print:grid-cols-6">
            {relatorio.maisVendidas.map((f) => (
              <li key={f.fotoId} className="flex flex-col gap-1">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <Image src={f.urlMiniatura} alt="" fill sizes="120px" className="object-cover" />
                </div>
                <span className="truncate text-xs text-muted-foreground">{f.nomeArquivo}</span>
                <span className="text-xs font-medium">
                  {f.vendas} {f.vendas === 1 ? "venda" : "vendas"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
