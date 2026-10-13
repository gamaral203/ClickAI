// Pedidos pagos de um e-mail, para "Recuperar minhas compras" (quem comprou sem conta e perdeu o
// link). Só pedidos `pago` sem reembolso pedido: o resto não tem fotos para baixar.

import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type CompraDoEmail = {
  pedidoId: string;
  pagoEm: string;
  totalCentavos: number;
  itens: number;
  eventos: string[];
};

/** Até 30 pedidos pagos do e-mail (sem diferenciar maiúsculas), do mais recente ao mais antigo. */
export async function comprasPagasDoEmail(email: string): Promise<CompraDoEmail[]> {
  const banco = await obterBanco();
  const pedidos = await banco
    .select({
      id: t.pedidos.id,
      pagoEm: t.pedidos.pagoEm,
      criadoEm: t.pedidos.criadoEm,
      totalCentavos: t.pedidos.totalCentavos,
    })
    .from(t.pedidos)
    .where(
      and(
        sql`lower(${t.pedidos.emailComprador}) = ${email.trim().toLowerCase()}`,
        eq(t.pedidos.status, "pago"),
        isNull(t.pedidos.reembolsoSolicitadoEm),
      ),
    )
    .orderBy(desc(sql`coalesce(${t.pedidos.pagoEm}, ${t.pedidos.criadoEm})`))
    .limit(30);
  if (pedidos.length === 0) return [];
  const itens = await banco
    .select({ pedidoId: t.itensPedido.pedidoId, evento: t.eventos.titulo })
    .from(t.itensPedido)
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      inArray(
        t.itensPedido.pedidoId,
        pedidos.map((p) => p.id),
      ),
    );
  return pedidos.map((p) => {
    const doPedido = itens.filter((i) => i.pedidoId === p.id);
    return {
      pedidoId: p.id,
      pagoEm: (p.pagoEm ?? p.criadoEm).toISOString(),
      totalCentavos: p.totalCentavos,
      itens: doPedido.length,
      eventos: [...new Set(doPedido.map((i) => i.evento))],
    };
  });
}
