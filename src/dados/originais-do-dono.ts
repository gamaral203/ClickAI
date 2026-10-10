// Originais do evento para o dono baixar (src/servicos/originais-do-dono.ts). Só o dono: toda
// consulta junta `eventos` e confere `eventos.fotografo_id` no WHERE, então colaborador, outro
// fotógrafo ou id trocado na requisição dão lista vazia (sem IDOR).
//
// Duas opções:
//   - "vendidas": itens do evento que estão em pelo menos um pedido `pago`, de qualquer autor
//     (o dono vê o evento inteiro, inclusive as vendas dos colaboradores; docs/arquitetura.md,
//     "Desempenho do evento"). Pendente, expirado, cancelado, estornado e contestado não contam.
//     Foto excluída depois da venda continua (quem comprou também continua baixando);
//   - "minhas": tudo o que o próprio dono enviou ao evento e ficou pronto, inclusive o que ele
//     excluiu (vem marcado, para a tela avisar e separar numa pasta).

import "server-only";

import { and, asc, eq, exists, gt, inArray, isNotNull, sql, type SQL } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type ModoOriginais = (typeof t.modoOriginaisDoDono.enumValues)[number];

export type EventoDoDono = { id: string; slug: string; titulo: string };

export type OriginalDoDono = {
  id: string;
  chave: string;
  nomeArquivo: string;
  tamanhoBytes: number | null;
  excluida: boolean;
};

export type ResumoOriginais = {
  quantidade: number;
  /** Soma dos tamanhos conhecidos (itens antigos ou de exemplo podem não ter). */
  bytes: number;
  /** Quantos estão excluídos (só na opção "minhas"). */
  excluidas: number;
};

/** Evento, se ele for deste fotógrafo (dono); senão `null`. */
export async function eventoDoDono(
  eventoId: string,
  fotografoId: string,
): Promise<EventoDoDono | null> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ id: t.eventos.id, slug: t.eventos.slug, titulo: t.eventos.titulo })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return evento ?? null;
}

/** Condição do WHERE para o modo; sempre presa ao evento e ao dono. */
function condicoes(eventoId: string, fotografoId: string, modo: ModoOriginais): SQL {
  const base = and(
    eq(t.fotos.eventoId, eventoId),
    eq(t.eventos.fotografoId, fotografoId),
    isNotNull(t.fotos.chaveOriginal),
  )!;
  if (modo === "minhas") {
    return and(base, eq(t.fotos.enviadaPor, fotografoId), eq(t.fotos.status, "pronta"))!;
  }
  return base;
}

/** Subconsulta "o item está em algum pedido pago". */
async function vendidaEmPedidoPago() {
  const banco = await obterBanco();
  return exists(
    banco
      .select({ um: sql`1` })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .where(and(eq(t.itensPedido.fotoId, t.fotos.id), eq(t.pedidos.status, "pago"))),
  );
}

async function filtro(eventoId: string, fotografoId: string, modo: ModoOriginais) {
  const onde = condicoes(eventoId, fotografoId, modo);
  return modo === "vendidas" ? and(onde, await vendidaEmPedidoPago())! : onde;
}

/** Quantidade, tamanho total e excluídas de cada opção, para a tela antes de baixar. */
export async function resumoOriginaisDoDono(
  eventoId: string,
  fotografoId: string,
  modo: ModoOriginais,
): Promise<ResumoOriginais> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      quantidade: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}), 0)::bigint`,
      excluidas: sql<number>`count(${t.fotos.excluidaEm})::int`,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(await filtro(eventoId, fotografoId, modo));
  return {
    quantidade: Number(linha?.quantidade ?? 0),
    bytes: Number(linha?.bytes ?? 0),
    excluidas: modo === "minhas" ? Number(linha?.excluidas ?? 0) : 0,
  };
}

/**
 * Um lote de originais, em ordem de id (estável entre lotes): os que vêm depois de `depois`, ou
 * só os `ids` pedidos (para repetir falhas ou renovar URLs vencidas). Ids que não passam no
 * filtro do dono e do modo simplesmente não voltam.
 */
export async function loteOriginaisDoDono(opcoes: {
  eventoId: string;
  fotografoId: string;
  modo: ModoOriginais;
  limite: number;
  depois?: string | null;
  ids?: string[];
}): Promise<OriginalDoDono[]> {
  const { eventoId, fotografoId, modo, limite, depois, ids } = opcoes;
  if (ids && ids.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.fotos.id,
      chave: t.fotos.chaveOriginal,
      nomeArquivo: t.fotos.nomeArquivo,
      tamanhoBytes: t.fotos.tamanhoBytes,
      excluidaEm: t.fotos.excluidaEm,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        await filtro(eventoId, fotografoId, modo),
        ids ? inArray(t.fotos.id, ids) : undefined,
        depois ? gt(t.fotos.id, depois) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
  return linhas.map((l) => ({
    id: l.id,
    chave: l.chave!,
    nomeArquivo: l.nomeArquivo,
    tamanhoBytes: l.tamanhoBytes,
    excluida: l.excluidaEm !== null,
  }));
}

/** Registra um lote entregue ao dono (auditoria): sem URLs nem chaves. */
export async function registrarLoteDoDono(registro: {
  eventoId: string;
  fotografoId: string;
  usuarioId: string;
  modo: ModoOriginais;
  quantidade: number;
  ip: string | null;
}) {
  const banco = await obterBanco();
  await banco.insert(t.downloadsDoDono).values(registro);
}

/** Lotes registrados de um evento, do mais novo ao mais antigo (para conferência e testes). */
export async function lotesDoDonoRegistrados(eventoId: string) {
  const banco = await obterBanco();
  return banco
    .select()
    .from(t.downloadsDoDono)
    .where(eq(t.downloadsDoDono.eventoId, eventoId))
    .orderBy(sql`${t.downloadsDoDono.criadoEm} desc`);
}
