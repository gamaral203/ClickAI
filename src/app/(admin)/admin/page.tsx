import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Landmark,
  ShoppingBag,
  Users,
} from "lucide-react";

import { Celula, CartaoNumero, Tabela } from "@/components/admin/tabela";
import { GraficoVendas } from "@/components/graficos/grafico-vendas";
import { resumoGeral, resumoPorFotografo, vendasPorDiaDaPlataforma } from "@/dados";
import { formatarPreco } from "@/lib/formatar";
import { exigirGestor } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Gestão", robots: { index: false, follow: false } };

export default function PaginaGestao() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Visão geral</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirGestor("/admin");
  const [resumo, porFotografo, porDia] = await Promise.all([
    resumoGeral(),
    resumoPorFotografo(),
    vendasPorDiaDaPlataforma(),
  ]);
  const { usuariosPorPapel: papeis } = resumo;

  return (
    <>
      <GraficoVendas
        titulo="Entradas por dia"
        descricao="Últimos 30 dias, total dos pedidos pagos"
        pontos={porDia}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <CartaoNumero
          icone={<ArrowDownToLine aria-hidden="true" className="size-4" />}
          titulo="Entrou (vendas pagas)"
          valor={formatarPreco(resumo.entradaCentavos)}
          texto={`${resumo.pedidosPagos} pedidos pagos · ${resumo.pedidosPendentes} aguardando`}
        />
        <CartaoNumero
          icone={<ArrowUpFromLine aria-hidden="true" className="size-4" />}
          titulo="Saiu (saques pagos)"
          valor={formatarPreco(resumo.saidaCentavos)}
          texto={`${resumo.saquesProcessando} saques em processamento`}
        />
        <CartaoNumero
          icone={<Landmark aria-hidden="true" className="size-4" />}
          titulo="Receita da plataforma"
          valor={formatarPreco(resumo.taxasCentavos)}
          texto="Comissão e antecipação dos saques pagos"
        />
        <CartaoNumero
          icone={<Clock aria-hidden="true" className="size-4" />}
          titulo="A pagar aos fotógrafos"
          valor={formatarPreco(resumo.aPagarCentavos)}
          texto="Vendas ainda não sacadas (valor bruto)"
        />
        <CartaoNumero
          icone={<ShoppingBag aria-hidden="true" className="size-4" />}
          titulo="Vendedores"
          valor={String(papeis.fotografo)}
          texto={`${porFotografo.filter((f) => !f.chavePixConfirmada).length} sem chave Pix confirmada`}
        />
        <CartaoNumero
          icone={<Users aria-hidden="true" className="size-4" />}
          titulo="Usuários"
          valor={String(Object.values(papeis).reduce((s, n) => s + n, 0))}
          texto={`${papeis.cliente} clientes · ${papeis.admin} gestores`}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Por vendedor</h2>
        <Tabela
          colunas={[
            { rotulo: "Vendedor" },
            { rotulo: "Vendido", direita: true },
            { rotulo: "Sacado", direita: true },
            { rotulo: "Taxas", direita: true },
            { rotulo: "A pagar", direita: true },
          ]}
          vazio="Nenhum vendedor ainda."
        >
          {porFotografo.map((f) => (
            <tr key={f.fotografoId}>
              <Celula>
                <span className="flex flex-col">
                  <span className="font-medium">{f.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.email}
                    {!f.chavePixConfirmada && " · sem chave Pix"}
                  </span>
                </span>
              </Celula>
              <Celula direita>{formatarPreco(f.vendidoCentavos)}</Celula>
              <Celula direita>{formatarPreco(f.sacadoCentavos)}</Celula>
              <Celula direita>{formatarPreco(f.taxasCentavos)}</Celula>
              <Celula direita forte>
                {formatarPreco(f.aPagarCentavos)}
              </Celula>
            </tr>
          ))}
        </Tabela>
        <p className="text-sm text-muted-foreground">
          Vendido e a pagar são brutos; a comissão sai no saque. Os dados de exemplo ficam na
          memória do servidor até o banco entrar (Fase 11).
        </p>
      </section>
    </>
  );
}
