import type { Metadata } from "next";
import { Suspense } from "react";

import { SaquesAPagar } from "@/components/admin/saques-a-pagar";
import { Celula, mascararDocumento, Tabela } from "@/components/admin/tabela";
import { BotaoNotificacoes } from "@/components/notificacoes/botao-notificacoes";
import { listarSaquesDoAdmin, type StatusSaque } from "@/dados";
import { formatarCpfCnpj } from "@/lib/documentos";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { pagarAte, saqueAtrasado } from "@/servicos/avisos-saque";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Saques", robots: { index: false, follow: false } };

const STATUS: Record<StatusSaque, string> = {
  processando: "Aguardando Pix",
  pago: "Pago",
  falhou: "Não realizado",
};

export default function PaginaSaquesGestao() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Saques</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirGestor("/admin/saques");
  const saques = await listarSaquesDoAdmin();
  // Os mais antigos primeiro: quem pediu antes é pago antes.
  const aPagar = saques
    .filter((s) => s.status === "processando")
    .reverse()
    .map((s) => ({
      id: s.id,
      fotografoNome: s.fotografoNome,
      chavePix: formatarCpfCnpj(s.chavePix),
      valor: formatarPreco(s.liquidoCentavos),
      antecipado: s.antecipado,
      pedidoEm: formatarDataEHora(s.criadoEm),
      pagarAte: formatarDataEHora(pagarAte(s)),
      atrasado: saqueAtrasado(s),
    }));

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Para pagar ({aPagar.length})</h2>
            <p className="text-sm text-muted-foreground">
              Saques pedidos pelos fotógrafos. Faça o Pix pelo app do banco em até 1 dia e marque
              como pago: o fotógrafo é avisado.
            </p>
          </div>
          <BotaoNotificacoes contexto="pedidos de saque" />
        </div>
        <SaquesAPagar saques={aPagar} />
      </section>
      <h2 className="mt-4 text-xl font-semibold">Histórico</h2>
      <p className="text-muted-foreground">
        Histórico de todos os saques: quem sacou, para qual chave, quanto foi de taxa e o que saiu
        da conta.
      </p>
      <Tabela
        colunas={[
          { rotulo: "Pedido em" },
          { rotulo: "Vendedor" },
          { rotulo: "Chave Pix" },
          { rotulo: "Tipo" },
          { rotulo: "Status" },
          { rotulo: "Bruto", direita: true },
          { rotulo: "Taxas", direita: true },
          { rotulo: "Saiu", direita: true },
        ]}
        vazio="Nenhum saque ainda."
      >
        {saques.map((s) => (
          <tr key={s.id}>
            <Celula>
              <span className="whitespace-nowrap">{formatarDataEHora(s.criadoEm)}</span>
            </Celula>
            <Celula>{s.fotografoNome}</Celula>
            <Celula>
              <span className="font-mono text-xs">{mascararDocumento(s.chavePix)}</span>
            </Celula>
            <Celula>{s.antecipado ? "Antecipado" : "Normal"}</Celula>
            <Celula>
              <span className="flex flex-col whitespace-nowrap">
                {STATUS[s.status]}
                {s.pagoEm && (
                  <span className="text-xs text-muted-foreground">
                    {formatarDataEHora(s.pagoEm)}
                  </span>
                )}
              </span>
            </Celula>
            <Celula direita>{formatarPreco(s.brutoCentavos)}</Celula>
            <Celula direita>{formatarPreco(s.taxaCentavos)}</Celula>
            <Celula direita forte>
              {formatarPreco(s.liquidoCentavos)}
            </Celula>
          </tr>
        ))}
      </Tabela>
    </>
  );
}
