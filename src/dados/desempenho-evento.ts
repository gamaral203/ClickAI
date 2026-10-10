// Desempenho de um evento no painel: os números de venda, público e ganhos numa tela só.
//
// Quem vê: o dono do evento (tudo) e o colaborador que aceitou o convite (só o que é dele).
// A checagem fica aqui, não só na página: qualquer outra pessoa recebe `null`, como um evento
// que não existe. Para o colaborador, tudo o que é dinheiro ou foto fica restrito aos itens de
// que ele é autor (`itens_pedido.fotografo_id`, `fotos.enviada_por`) e aos lançamentos dele;
// faturamento do evento, ganho do dono e números dos outros colaboradores nunca saem daqui.
// Visitas e carrinhos são do evento inteiro (não são dinheiro de ninguém), e o ranking da equipe
// é o mesmo que ele já vê em Colaborações.

import "server-only";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { topCliquesDoEvento, type PosicaoTopCliques } from "./autores";
import { iso } from "./mapas";
import type { Evento } from "./tipos";
import {
  ganhosNoEvento,
  maisVendidasDoEscopo,
  metricasDoEvento,
  resumoDeVendas,
  serieAteHoje,
  type FotoMaisVendida,
  type VendasPorDia,
} from "./vendas-do-evento";

export type PapelNoEvento = "dono" | "colaborador";

export type DesempenhoNoEvento = {
  papel: PapelNoEvento;
  evento: Pick<
    Evento,
    "id" | "titulo" | "slug" | "status" | "inicioEm" | "fimEm" | "local" | "cidade" | "estado"
  >;
  /** Fotos e vídeos prontos e não excluídos (do colaborador, só os que ele enviou). */
  fotosCarregadas: number;
  /** Fotos distintas em pedidos pagos, inclusive as excluídas depois da venda. */
  fotosVendidas: number;
  pedidos: number;
  porMetodo: { pix: number; cartao: number };
  /** O que os clientes pagaram pelos itens do escopo (preço menos desconto). */
  faturamentoCentavos: number;
  ticketMedioCentavos: number;
  maiorPedidoCentavos: number;
  ultimaVendaEm: string | null;
  ganhos: {
    vendasPropriasCentavos: number;
    /** Só o dono recebe; para o colaborador é sempre 0. */
    comissaoComoDonoCentavos: number;
    brutoCentavos: number;
    /** Estimativa da taxa da plataforma no saque normal (a antecipação cobra um pouco mais). */
    taxaCentavos: number;
    comissaoPct: number;
    liquidoCentavos: number;
  };
  /** Do evento inteiro. */
  visitas: number;
  carrinhos: number;
  /** Pedidos do escopo ÷ visitas do evento (0 a 1); 0 sem visitas. */
  conversao: number;
  /** Downloads dos originais dos itens do escopo. */
  downloads: number;
  /** Do dia da primeira venda até hoje, com zero nos dias sem venda (no máximo 60 dias). */
  porDia: VendasPorDia[];
  maisVendidas: FotoMaisVendida[];
  equipe: { quantidade: number; posicoes: PosicaoTopCliques[] };
};

/** Papel do fotógrafo no evento, ou `null` se não for dono nem colaborador que aceitou. */
async function papelNoEvento(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({
      id: t.eventos.id,
      dono: t.eventos.fotografoId,
      titulo: t.eventos.titulo,
      slug: t.eventos.slug,
      status: t.eventos.status,
      inicioEm: t.eventos.inicioEm,
      fimEm: t.eventos.fimEm,
      local: t.eventos.local,
      cidade: t.eventos.cidade,
      estado: t.eventos.estado,
    })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  if (!evento) return null;
  const { dono, ...dados } = evento;
  const resumo = { ...dados, inicioEm: iso(dados.inicioEm), fimEm: iso(dados.fimEm) };
  if (dono === fotografoId) return { papel: "dono" as const, evento: resumo };
  // A mesma regra de podeEnviarAoEvento: convite pendente não dá acesso.
  const [colaborador] = await banco
    .select({ id: t.colaboradores.id })
    .from(t.colaboradores)
    .where(
      and(
        eq(t.colaboradores.eventoId, eventoId),
        eq(t.colaboradores.fotografoId, fotografoId),
        isNotNull(t.colaboradores.aceitoEm),
      ),
    );
  return colaborador ? { papel: "colaborador" as const, evento: resumo } : null;
}

export async function desempenhoDoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<DesempenhoNoEvento | null> {
  await connection();
  const acesso = await papelNoEvento(eventoId, fotografoId);
  if (!acesso) return null;
  const { papel, evento } = acesso;
  // O dono vê o evento inteiro; o colaborador, só os itens de que é autor.
  const autorId = papel === "dono" ? null : fotografoId;
  const escopo = { eventoId, autorId };
  const banco = await obterBanco();

  const [[fotos], [baixados], [conta], vendas, ganhos, metricas, maisVendidas, equipe] =
    await Promise.all([
      banco
        .select({ carregadas: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(
          and(
            eq(t.fotos.eventoId, eventoId),
            eq(t.fotos.status, "pronta"),
            isNull(t.fotos.excluidaEm),
            autorId ? eq(t.fotos.enviadaPor, autorId) : undefined,
          ),
        ),
      banco
        .select({ total: sql<number>`count(*)::int` })
        .from(t.downloads)
        .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.downloads.itemPedidoId))
        .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
        .where(
          and(
            eq(t.fotos.eventoId, eventoId),
            autorId ? eq(t.itensPedido.fotografoId, autorId) : undefined,
          ),
        ),
      banco
        .select({ comissaoPct: t.fotografos.comissaoPct })
        .from(t.fotografos)
        .where(eq(t.fotografos.id, fotografoId)),
      resumoDeVendas(escopo),
      ganhosNoEvento(eventoId, fotografoId),
      metricasDoEvento(eventoId),
      maisVendidasDoEscopo(escopo),
      topCliquesDoEvento(eventoId),
    ]);

  // O colaborador não tem comissão como dono; se algum dia aparecer, não entra na conta dele.
  const comissaoComoDonoCentavos = papel === "dono" ? ganhos.comissaoComoDonoCentavos : 0;
  const brutoCentavos = ganhos.vendasPropriasCentavos + comissaoComoDonoCentavos;
  const comissaoPct = conta?.comissaoPct ?? 0;
  // Mesma conta do saque normal (src/servicos/saques.ts): para baixo, o centavo fica com ele.
  const taxaCentavos = Math.max(0, Math.floor((brutoCentavos * comissaoPct) / 100));

  return {
    papel,
    evento,
    fotosCarregadas: fotos?.carregadas ?? 0,
    fotosVendidas: vendas.fotosVendidas,
    pedidos: vendas.pedidos,
    porMetodo: vendas.porMetodo,
    faturamentoCentavos: vendas.faturamentoCentavos,
    ticketMedioCentavos: vendas.ticketMedioCentavos,
    maiorPedidoCentavos: vendas.maiorPedidoCentavos,
    ultimaVendaEm: vendas.ultimaVendaEm,
    ganhos: {
      vendasPropriasCentavos: ganhos.vendasPropriasCentavos,
      comissaoComoDonoCentavos,
      brutoCentavos,
      taxaCentavos,
      comissaoPct,
      liquidoCentavos: brutoCentavos - taxaCentavos,
    },
    visitas: metricas.visitas,
    carrinhos: metricas.carrinhos,
    conversao: metricas.visitas ? vendas.pedidos / metricas.visitas : 0,
    downloads: baixados?.total ?? 0,
    porDia: serieAteHoje(vendas.porDia, Date.now()),
    maisVendidas,
    equipe: { quantidade: equipe.length, posicoes: equipe },
  };
}

/**
 * Total pago pelos clientes e pedidos pagos do evento inteiro, para o resumo no cabeçalho do
 * evento. Só para o dono: `null` para qualquer outra pessoa.
 */
export async function totaisDoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<{ pedidos: number; faturamentoCentavos: number } | null> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  if (!evento) return null;
  const [linha] = await banco
    .select({
      pedidos: sql<number>`count(distinct ${t.pedidos.id})::int`,
      faturamento: sql<number>`coalesce(sum(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos}), 0)::int`,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .where(and(eq(t.pedidos.status, "pago"), eq(t.fotos.eventoId, eventoId)));
  return { pedidos: linha?.pedidos ?? 0, faturamentoCentavos: linha?.faturamento ?? 0 };
}

/**
 * Fração das fotos carregadas que já vendeu (0 a 1), ou `null` sem fotos carregadas. Fica em no
 * máximo 1: uma foto excluída depois da venda continua nas vendidas, mas sai das carregadas.
 */
export function fracaoVendida(fotosVendidas: number, fotosCarregadas: number): number | null {
  if (fotosCarregadas <= 0) return null;
  return Math.min(1, fotosVendidas / fotosCarregadas);
}
