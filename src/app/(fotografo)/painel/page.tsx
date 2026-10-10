import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Percent,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { CartaoNumero } from "@/components/admin/tabela";
import { GraficoVendas } from "@/components/graficos/grafico-vendas";
import { BotaoNotificacoes } from "@/components/notificacoes/botao-notificacoes";
import { LinkDoFotografo } from "@/components/painel/link-do-fotografo";
import { Recepcao } from "@/components/painel/recepcao";
import { CartaoMeta } from "@/components/metas/cartao-meta";
import { buttonVariants } from "@/components/ui/button";
import {
  dashboardDoFotografo,
  listarEventosDoFotografo,
  totalVendidoComoAutor,
  vendasPorDiaDoFotografo,
} from "@/dados";
import { urlDoAvatar } from "@/lib/avatares";
import { urlDoSite } from "@/lib/endereco";
import { formatarPorcentagem, formatarPreco } from "@/lib/formatar";
import { situacaoDasMetas } from "@/lib/metas";
import { mostraCartaoMeta } from "@/lib/navegacao";
import { humorDoPainel, pedidosPorSemana } from "@/lib/recepcao";
import { situacaoFinanceira } from "@/servicos/saques";
import { exigirFotografo } from "@/servicos/sessao";

export const metadata: Metadata = { title: "Painel", robots: { index: false, follow: false } };

export default function PaginaPainel() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
      <Conteudo />
    </Suspense>
  );
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

async function Conteudo() {
  const { usuario, conta } = await exigirFotografo();
  const [painel, financeiro, porDia] = await Promise.all([
    dashboardDoFotografo(conta.id),
    situacaoFinanceira(conta, usuario),
    vendasPorDiaDoFotografo(conta.id),
  ]);
  const { saldo } = financeiro;
  // Recepção: só métricas reais do próprio fotógrafo (eventos publicados e pedidos por semana).
  const publicados = (await listarEventosDoFotografo(conta.id)).filter(
    (e) => e.status === "publicado",
  ).length;
  const semanas = pedidosPorSemana(porDia);
  const humor = humorDoPainel({ publicados, ...semanas });
  const detalheRecepcao =
    humor === "alta"
      ? `${plural(semanas.pedidosSemana, "pedido", "pedidos")} nos últimos 7 dias.`
      : humor === "baixo" && semanas.pedidosSemanaAnterior > 0
        ? `${plural(semanas.pedidosSemanaAnterior, "pedido", "pedidos")} na semana anterior: dá para voltar.`
        : null;

  const passos = [
    // O e-mail já foi confirmado pelo código (ou pelo Google) antes de a conta existir.
    { feito: true, texto: "Criar a conta de fotógrafo" },
    { feito: Boolean(conta.cpfCnpj), texto: "Informar CPF ou CNPJ", href: "/painel/perfil" },
    {
      feito: Boolean(conta.chavePix),
      texto: "Confirmar a chave Pix para saque",
      href: "/painel/perfil",
    },
  ];
  const pronto = passos.every((p) => p.feito);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Olá, {conta.nomePublico}</h1>
        <Link href="/painel/eventos/novo" className={buttonVariants({ size: "touch" })}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          Novo evento
        </Link>
      </div>

      {/* Em tela larga (xl), o cartão da meta fica no cabeçalho, no lugar do nome. Aparece para
          quem tem conta de fotógrafo, como o gestor que também vende (aqui a conta sempre existe). */}
      {mostraCartaoMeta(usuario, conta) && (
        <div className="xl:hidden">
          <CartaoMeta
            metas={situacaoDasMetas(await totalVendidoComoAutor(conta.id))}
            foto={urlDoAvatar(conta)}
            larguraTotal
          />
        </div>
      )}

      <Recepcao humor={humor} detalhe={detalheRecepcao} />

      <LinkDoFotografo url={urlDoSite(`/fotografo/${conta.slug}`)} nome={conta.nomePublico} />

      <BotaoNotificacoes contexto="vendas e saques" />

      {!pronto && (
        <section className="flex flex-col gap-4 rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Antes de publicar seu primeiro evento</h2>
          <ul className="flex flex-col gap-3">
            {passos.map((passo) => (
              <li key={passo.texto} className="flex items-center gap-3">
                {passo.feito ? (
                  <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
                ) : (
                  <Circle aria-hidden="true" className="size-5 text-muted-foreground" />
                )}
                <span className={passo.feito ? "text-muted-foreground line-through" : undefined}>
                  {passo.texto}
                </span>
                <span className="sr-only">{passo.feito ? "(feito)" : "(pendente)"}</span>
                {!passo.feito && passo.href && (
                  <Link
                    href={passo.href}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Fazer agora
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="resumo" className="flex flex-col gap-3">
        <h2 id="resumo" className="text-xl font-semibold">
          Resumo
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <CartaoNumero
            icone={<TrendingUp aria-hidden="true" className="size-4" />}
            titulo="Vendas de hoje"
            valor={formatarPreco(painel.hoje.valorCentavos)}
            texto={plural(painel.hoje.pedidos, "pedido", "pedidos")}
          />
          <CartaoNumero
            icone={<CalendarDays aria-hidden="true" className="size-4" />}
            titulo="Vendas do mês"
            valor={formatarPreco(painel.mes.valorCentavos)}
            texto={plural(painel.mes.pedidos, "pedido", "pedidos")}
          />
          <CartaoNumero
            icone={<Wallet aria-hidden="true" className="size-4" />}
            titulo="Saldo disponível"
            valor={formatarPreco(saldo.disponivelCentavos)}
            texto={`Você recebe ${formatarPreco(saldo.normal.liquidoCentavos)} no saque normal`}
          />
          <CartaoNumero
            icone={<Clock aria-hidden="true" className="size-4" />}
            titulo="A receber"
            valor={formatarPreco(saldo.antecipavelCentavos + saldo.aLiberarCentavos)}
            texto={`${formatarPreco(saldo.antecipavelCentavos)} já dá para antecipar`}
          />
          <CartaoNumero
            icone={<Receipt aria-hidden="true" className="size-4" />}
            titulo="Ticket médio"
            valor={formatarPreco(painel.ticketMedioCentavos)}
            texto="Por pedido, nos últimos 30 dias"
          />
          <CartaoNumero
            icone={<Percent aria-hidden="true" className="size-4" />}
            titulo="Conversão"
            valor={formatarPorcentagem(painel.conversao)}
            texto={`${plural(painel.pedidos30d, "pedido", "pedidos")} em ${plural(painel.visitas30d, "visita", "visitas")} (30 dias)`}
          />
        </div>
        <GraficoVendas
          titulo="Vendas por dia"
          descricao="Últimos 30 dias, a sua parte de cada venda"
          pontos={porDia}
        />
        <p className="text-sm text-muted-foreground">
          Valores das vendas e do saldo são brutos: a taxa da plataforma sai no saque. Detalhes em{" "}
          <Link href="/painel/vendas" className="font-medium text-primary hover:underline">
            Financeiro
          </Link>{" "}
          e em{" "}
          <Link href="/painel/desempenho" className="font-medium text-primary hover:underline">
            Desempenho
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
