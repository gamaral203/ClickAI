import type { Metadata } from "next";
import { Suspense } from "react";

import { Celula, mascararDocumento, Tabela } from "@/components/admin/tabela";
import { listarSaquesDoAdmin, type StatusSaque } from "@/dados";
import { formatarDataEHora, formatarPreco } from "@/lib/formatar";
import { exigirEquipe } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Saques", robots: { index: false, follow: false } };

const STATUS: Record<StatusSaque, string> = {
  processando: "Processando",
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
  await exigirEquipe("/admin/saques");
  const saques = await listarSaquesDoAdmin();

  return (
    <>
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
