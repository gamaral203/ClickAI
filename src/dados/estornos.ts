// Estorno e chargeback no banco (docs/arquitetura.md, "Estorno e chargeback"). Cada mudança de
// status do pedido e os lançamentos que ela gera vão numa única transação, e o status só muda a
// partir dos status esperados (`… WHERE status IN (…)`): avisos repetidos ou simultâneos do
// webhook não estornam duas vezes. O índice único em `lancamentos.estorno_de` garante, no
// próprio banco, que cada lançamento é desfeito no máximo uma vez.

import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco, type Banco } from "@/db";
import * as t from "@/db/schema";

import { deIso, iso } from "./mapas";
import type { Lancamento, MetodoPagamento, MotivoEstorno, StatusPedido } from "./tipos";

type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

/**
 * Desfaz os lançamentos "vivos" do pedido com o sinal pedido: no estorno, cada venda (ou volta
 * de estorno) positiva que ainda não foi desfeita ganha um lançamento negativo; na restauração,
 * cada estorno negativo ainda não desfeito ganha o positivo de volta.
 *
 * O novo lançamento copia as datas do original se ele ainda não entrou em nenhum saque: os dois
 * se anulam no mesmo prazo. Se o original já está num saque (pago ou em processamento), o saque
 * não é tocado; o novo lançamento fica disponível na hora e é abatido do próximo saque, e o
 * saldo pode ficar negativo até lá.
 */
async function desfazerLancamentos(
  tx: Transacao,
  pedidoId: string,
  sinal: "positivos" | "negativos",
  agora: Date,
) {
  const doPedido = await tx
    .select({ lancamento: t.lancamentos })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .where(eq(t.itensPedido.pedidoId, pedidoId));
  const lancamentos = doPedido.map((l) => l.lancamento);
  const desfeitos = new Set(lancamentos.map((l) => l.estornoDe).filter(Boolean));
  const vivos = lancamentos.filter(
    (l) =>
      !desfeitos.has(l.id) && (sinal === "positivos" ? l.valorCentavos > 0 : l.valorCentavos < 0),
  );
  if (vivos.length === 0) return 0;
  const inseridos = await tx
    .insert(t.lancamentos)
    .values(
      vivos.map((l) => ({
        fotografoId: l.fotografoId,
        itemPedidoId: l.itemPedidoId,
        valorCentavos: -l.valorCentavos,
        disponivelEm: l.saqueId === null ? l.disponivelEm : agora,
        antecipavelEm: l.saqueId === null ? l.antecipavelEm : agora,
        saqueId: null,
        estornoDe: l.id,
      })),
    )
    .onConflictDoNothing({ target: t.lancamentos.estornoDe })
    .returning({ id: t.lancamentos.id });
  return inseridos.length;
}

/**
 * Marca o pedido pago como "reembolso pedido pelo gestor". Daqui em diante os downloads param.
 * Só marca uma vez; devolve se marcou agora.
 */
export async function marcarReembolsoSolicitado(pedidoId: string, gestorId: string) {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.pedidos)
    .set({ reembolsoSolicitadoEm: new Date(), reembolsoSolicitadoPor: gestorId })
    .where(
      and(
        eq(t.pedidos.id, pedidoId),
        eq(t.pedidos.status, "pago"),
        isNull(t.pedidos.reembolsoSolicitadoEm),
      ),
    )
    .returning({ id: t.pedidos.id });
  return atualizados.length > 0;
}

/**
 * Estorna o pedido (`estornado`, final) ou o põe em contestação (`contestado`), só a partir de
 * um dos status `de`, e estorna os lançamentos dos fotógrafos na mesma transação. Devolve se o
 * status mudou; `false` quer dizer que outro aviso já fez isso (ou o pedido não está em `de`).
 */
export async function estornarPedidoNoBanco(dados: {
  pedidoId: string;
  de: StatusPedido[];
  para: "estornado" | "contestado";
  motivo: MotivoEstorno | null;
  agora: Date;
}): Promise<boolean> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const mudou = await tx
      .update(t.pedidos)
      .set(
        dados.para === "estornado"
          ? { status: "estornado", estornadoEm: dados.agora, motivoEstorno: dados.motivo }
          : { status: "contestado", contestadoEm: dados.agora },
      )
      .where(and(eq(t.pedidos.id, dados.pedidoId), inArray(t.pedidos.status, dados.de)))
      .returning({ id: t.pedidos.id });
    if (mudou.length === 0) return false;
    await desfazerLancamentos(tx, dados.pedidoId, "positivos", dados.agora);
    return true;
  });
}

/**
 * Contestação ganha: o pedido `contestado` volta a `pago` e os estornos dos lançamentos são
 * desfeitos. Se o pedido foi contestado antes de ter lançamentos (o chargeback chegou antes da
 * confirmação), grava `seNaoHouver`, os lançamentos da venda. Devolve se mudou.
 */
export async function restaurarPedidoNoBanco(
  pedidoId: string,
  agora: Date,
  seNaoHouver: Lancamento[],
): Promise<boolean> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const mudou = await tx
      .update(t.pedidos)
      .set({ status: "pago" })
      .where(and(eq(t.pedidos.id, pedidoId), eq(t.pedidos.status, "contestado")))
      .returning({ pagoEm: t.pedidos.pagoEm });
    if (mudou.length === 0) return false;
    if (!mudou[0].pagoEm) {
      await tx.update(t.pedidos).set({ pagoEm: agora }).where(eq(t.pedidos.id, pedidoId));
    }
    const existentes = await tx
      .select({ id: t.lancamentos.id })
      .from(t.lancamentos)
      .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
      .where(eq(t.itensPedido.pedidoId, pedidoId))
      .limit(1);
    if (existentes.length === 0 && seNaoHouver.length > 0) {
      await tx.insert(t.lancamentos).values(
        seNaoHouver.map((l) => ({
          ...l,
          disponivelEm: deIso(l.disponivelEm),
          antecipavelEm: deIso(l.antecipavelEm),
        })),
      );
    } else {
      await desfazerLancamentos(tx, pedidoId, "negativos", agora);
    }
    return true;
  });
}

export type EstornoDoAdmin = {
  id: string;
  status: StatusPedido;
  metodo: MetodoPagamento;
  totalCentavos: number;
  nomeComprador: string;
  emailComprador: string;
  gatewayId: string | null;
  pagoEm: string | null;
  reembolsoSolicitadoEm: string | null;
  reembolsoSolicitadoPor: string | null;
  contestadoEm: string | null;
  estornadoEm: string | null;
  motivoEstorno: MotivoEstorno | null;
};

/**
 * Pedidos com reembolso pedido, em contestação ou estornados, para o gestor acompanhar, do mais
 * recente para o mais antigo.
 */
export async function listarEstornosDoAdmin(): Promise<EstornoDoAdmin[]> {
  await connection();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ pedido: t.pedidos, gestor: t.usuarios.nome })
    .from(t.pedidos)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.pedidos.reembolsoSolicitadoPor))
    .where(
      or(
        inArray(t.pedidos.status, ["estornado", "contestado"]),
        isNotNull(t.pedidos.reembolsoSolicitadoEm),
        isNotNull(t.pedidos.contestadoEm),
      ),
    )
    .orderBy(desc(t.pedidos.criadoEm));
  return linhas.map(({ pedido: p, gestor }) => ({
    id: p.id,
    status: p.status,
    metodo: p.metodo,
    totalCentavos: p.totalCentavos,
    nomeComprador: p.nomeComprador,
    emailComprador: p.emailComprador,
    gatewayId: p.gatewayId,
    pagoEm: iso(p.pagoEm),
    reembolsoSolicitadoEm: iso(p.reembolsoSolicitadoEm),
    reembolsoSolicitadoPor: gestor,
    contestadoEm: iso(p.contestadoEm),
    estornadoEm: iso(p.estornadoEm),
    motivoEstorno: p.motivoEstorno,
  }));
}
