// Fotos vendidas do autor (/painel/vendidas; src/servicos/originais-do-dono.ts): tudo o que o
// fotógrafo ENVIOU (`fotos.enviada_por` = ele) e está em pelo menos um pedido `pago`, de qualquer
// evento: os que ele criou e aqueles em que colabora. Pendente, expirado, cancelado, estornado e
// contestado não contam. Foto excluída depois da venda continua (com o selo "excluída"). A foto do
// colaborador vendida no evento do dono NÃO aparece para o dono, nem a do dono para o colaborador:
// toda consulta prende `fotos.enviada_por` no WHERE, então id trocado ou de outro autor não volta.
//
// A lista mostra uma linha por venda (item de pedido pago); o download em lote ("vendidas_geral")
// entrega cada foto uma vez só, em ordem de id.

import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

import { ehEmailDeContaExcluida, NOME_CONTA_EXCLUIDA } from "./exclusao";
import type { OriginalDoDono } from "./originais-do-dono";
import type { TipoItem } from "./tipos";

export type FiltroVendidas = {
  eventoId?: string | null;
  /** Dia inicial (AAAA-MM-DD), no horário de Brasília. */
  de?: string | null;
  /** Dia final (AAAA-MM-DD), inclusive. */
  ate?: string | null;
  /** Parte do nome ou do e-mail do comprador. */
  comprador?: string | null;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Quando a venda conta: o pagamento (ou a criação, nos pedidos antigos sem `pago_em`). */
const vendidaEm = sql`coalesce(${t.pedidos.pagoEm}, ${t.pedidos.criadoEm})`;

/** Escapa os curingas do LIKE: o texto digitado é procurado como está. */
function semCuringas(texto: string) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Condições sobre o pedido (pago, período, comprador). */
function condicoesDoPedido(filtro: FiltroVendidas): SQL {
  const partes: (SQL | undefined)[] = [eq(t.pedidos.status, "pago")];
  if (filtro.de && DIA.test(filtro.de)) {
    partes.push(sql`${vendidaEm} >= ${`${filtro.de}T00:00:00-03:00`}::timestamptz`);
  }
  if (filtro.ate && DIA.test(filtro.ate)) {
    partes.push(
      sql`${vendidaEm} < (${`${filtro.ate}T00:00:00-03:00`}::timestamptz + interval '1 day')`,
    );
  }
  const termo = filtro.comprador?.trim().slice(0, 120);
  if (termo) {
    const padrao = `%${semCuringas(termo)}%`;
    partes.push(
      or(ilike(t.pedidos.nomeComprador, padrao), ilike(t.pedidos.emailComprador, padrao)),
    );
  }
  return and(...partes)!;
}

/** Condições sobre a foto: sempre do autor, com original, e no evento do filtro (se houver). */
function condicoesDaFoto(fotografoId: string, filtro: FiltroVendidas): SQL {
  return and(
    eq(t.fotos.enviadaPor, fotografoId),
    isNotNull(t.fotos.chaveOriginal),
    filtro.eventoId ? eq(t.fotos.eventoId, filtro.eventoId) : undefined,
  )!;
}

export type VendaDoAutor = {
  /** Item do pedido (uma linha por venda). */
  itemId: string;
  fotoId: string;
  eventoId: string;
  eventoTitulo: string;
  tipo: TipoItem;
  nomeArquivo: string;
  /** Miniatura pública, com marca d'água: a tela usa no vídeo e se a sem marca não vier. */
  urlMiniatura: string;
  /** Quando foi paga (ISO). */
  vendidaEm: string;
  compradorNome: string;
  /** E-mail inteiro (o autor contata o cliente quando dá erro); `null` quando a pessoa excluiu a conta. */
  compradorEmail: string | null;
  /**
   * A parte do autor nesta venda, em centavos: o lançamento dele (já sem a metade da taxa do
   * cartão; antes da comissão da plataforma, que sai no saque), ou o valor do item nas vendas
   * sem lançamento.
   */
  valorCentavos: number;
  excluida: boolean;
};

/** Uma página das vendas do autor, da mais recente para a mais antiga, e o total do filtro. */
export async function listarVendidasDoAutor(
  fotografoId: string,
  filtro: FiltroVendidas,
  pagina: number,
  porPagina: number,
): Promise<{ vendas: VendaDoAutor[]; total: number }> {
  const banco = await obterBanco();
  const onde = and(condicoesDaFoto(fotografoId, filtro), condicoesDoPedido(filtro));
  // Nomes escritos por extenso: dentro do sql``, o Drizzle escreve a coluna sem a tabela.
  const parteDoAutor = sql<number>`coalesce((select sum("lancamentos"."valor_centavos") from "lancamentos" where "lancamentos"."item_pedido_id" = "itens_pedido"."id" and "lancamentos"."fotografo_id" = ${fotografoId} and "lancamentos"."estorno_de" is null), "itens_pedido"."valor_fotografo_centavos")::int`;
  const [linhas, [contagem]] = await Promise.all([
    banco
      .select({
        itemId: t.itensPedido.id,
        fotoId: t.fotos.id,
        eventoId: t.eventos.id,
        eventoTitulo: t.eventos.titulo,
        tipo: t.fotos.tipo,
        nomeArquivo: t.fotos.nomeArquivo,
        urlMiniatura: t.fotos.urlMiniatura,
        excluidaEm: t.fotos.excluidaEm,
        pagoEm: t.pedidos.pagoEm,
        criadoEm: t.pedidos.criadoEm,
        nome: t.pedidos.nomeComprador,
        email: t.pedidos.emailComprador,
        valor: parteDoAutor,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
      .where(onde)
      .orderBy(desc(vendidaEm), desc(t.itensPedido.id))
      .limit(porPagina)
      .offset(Math.max(0, pagina - 1) * porPagina),
    banco
      .select({ total: count() })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(onde),
  ]);
  return {
    total: Number(contagem?.total ?? 0),
    vendas: linhas.map((l) => {
      const excluida = ehEmailDeContaExcluida(l.email);
      return {
        itemId: l.itemId,
        fotoId: l.fotoId,
        eventoId: l.eventoId,
        eventoTitulo: l.eventoTitulo,
        tipo: l.tipo,
        nomeArquivo: l.nomeArquivo,
        urlMiniatura: urlPublica(l.urlMiniatura),
        vendidaEm: (l.pagoEm ?? l.criadoEm).toISOString(),
        compradorNome: excluida ? NOME_CONTA_EXCLUIDA : l.nome,
        compradorEmail: excluida ? null : l.email,
        valorCentavos: Number(l.valor),
        excluida: l.excluidaEm !== null,
      };
    }),
  };
}

/** Eventos com fotos do autor vendidas (para o filtro), do que vendeu por último ao primeiro. */
export async function eventosComVendidasDoAutor(fotografoId: string) {
  const banco = await obterBanco();
  return banco
    .select({
      id: t.eventos.id,
      titulo: t.eventos.titulo,
      ultima: sql<string>`max(${vendidaEm})`,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(and(eq(t.fotos.enviadaPor, fotografoId), eq(t.pedidos.status, "pago")))
    .groupBy(t.eventos.id, t.eventos.titulo)
    .orderBy(desc(sql`max(${vendidaEm})`));
}

/** A foto está em algum pedido pago que passa no filtro (período e comprador). */
async function vendidaNoFiltro(filtro: FiltroVendidas) {
  const banco = await obterBanco();
  return exists(
    banco
      .select({ um: sql`1` })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .where(and(eq(t.itensPedido.fotoId, t.fotos.id), condicoesDoPedido(filtro))),
  );
}

/** Quantas fotos (cada uma uma vez) e quantos bytes o "Baixar todas do filtro" vai baixar. */
export async function resumoVendidasDoAutor(fotografoId: string, filtro: FiltroVendidas) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      quantidade: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}), 0)::bigint`,
    })
    .from(t.fotos)
    .where(and(condicoesDaFoto(fotografoId, filtro), await vendidaNoFiltro(filtro)));
  return { quantidade: Number(linha?.quantidade ?? 0), bytes: Number(linha?.bytes ?? 0) };
}

export type OriginalVendidoDoAutor = OriginalDoDono & { eventoId: string; eventoSlug: string };

/**
 * Um lote das fotos vendidas do autor, cada uma uma vez, em ordem de id (estável entre lotes): as
 * que vêm depois de `depois`, ou só os `ids` pedidos. Ids que não são dele, não foram vendidos em
 * pedido pago ou não passam no filtro simplesmente não voltam.
 */
export async function loteVendidasDoAutor(opcoes: {
  fotografoId: string;
  filtro: FiltroVendidas;
  limite: number;
  depois?: string | null;
  ids?: string[];
}): Promise<OriginalVendidoDoAutor[]> {
  const { fotografoId, filtro, limite, depois, ids } = opcoes;
  if (ids && ids.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.fotos.id,
      eventoId: t.fotos.eventoId,
      eventoSlug: t.eventos.slug,
      chave: t.fotos.chaveOriginal,
      nomeArquivo: t.fotos.nomeArquivo,
      tamanhoBytes: t.fotos.tamanhoBytes,
      excluidaEm: t.fotos.excluidaEm,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        condicoesDaFoto(fotografoId, filtro),
        await vendidaNoFiltro(filtro),
        ids ? inArray(t.fotos.id, ids) : undefined,
        depois ? gt(t.fotos.id, depois) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
  return linhas.map((l) => ({
    id: l.id,
    eventoId: l.eventoId,
    eventoSlug: l.eventoSlug,
    chave: l.chave!,
    nomeArquivo: l.nomeArquivo,
    tamanhoBytes: l.tamanhoBytes,
    excluida: l.excluidaEm !== null,
  }));
}
