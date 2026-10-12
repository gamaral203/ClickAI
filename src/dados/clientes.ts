// Meus clientes (/painel/clientes): quem comprou as fotos de um fotógrafo, quando e quais levou.
// Entram só os itens de que ele é o AUTOR (`itens_pedido.fotografo_id`, quem recebe pela foto),
// em pedidos `pago`: pendente, expirado, cancelado, estornado e contestado ficam de fora. Num
// evento colaborativo, ou num pedido com fotos de vários fotógrafos, cada um vê só as fotos dele.
//
// O nome e o e-mail do comprador vão ao fotógrafo de quem ele comprou, como diz a política de
// privacidade ("apenas para atender o pedido"). Quem excluiu a conta aparece como "Conta
// excluída", sem e-mail: o pedido já guarda só o marcador (src/dados/exclusao.ts).

import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

import { ehEmailDeContaExcluida, NOME_CONTA_EXCLUIDA } from "./exclusao";
import type { TipoItem } from "./tipos";

export type FotoDoCliente = {
  fotoId: string;
  eventoId: string;
  eventoTitulo: string;
  nomeArquivo: string;
  tipo: TipoItem;
  /** Miniatura pública, com marca d'água: a tela usa no vídeo e se a sem marca não vier. */
  urlMiniatura: string;
};

/** Um pedido pago do cliente, só com as fotos deste fotógrafo. */
export type CompraDoCliente = {
  pedidoId: string;
  /** Quando o pedido foi pago (ISO). */
  compradaEm: string;
  /** Na ordem das fotos no evento. */
  fotos: FotoDoCliente[];
};

export type ClienteDoFotografo = {
  /** Identifica o cliente: o e-mail em minúsculas (o marcador, na conta excluída). */
  chave: string;
  /** O nome do pedido mais recente. */
  nome: string;
  /** `null` quando a pessoa excluiu a conta. */
  email: string | null;
  /** Da compra mais recente para a mais antiga. */
  compras: CompraDoCliente[];
  /** Fotos deste fotógrafo que o cliente levou, somando as compras. */
  totalFotos: number;
  ultimaCompraEm: string;
};

/** Clientes do fotógrafo, de quem comprou por último para quem comprou primeiro. */
export async function listarClientesDoFotografo(
  fotografoId: string,
): Promise<ClienteDoFotografo[]> {
  const banco = await obterBanco();
  const compradoEm = sql`coalesce(${t.pedidos.pagoEm}, ${t.pedidos.criadoEm})`;
  const linhas = await banco
    .select({
      pedidoId: t.pedidos.id,
      pagoEm: t.pedidos.pagoEm,
      criadoEm: t.pedidos.criadoEm,
      nome: t.pedidos.nomeComprador,
      email: t.pedidos.emailComprador,
      fotoId: t.fotos.id,
      tipo: t.fotos.tipo,
      nomeArquivo: t.fotos.nomeArquivo,
      urlMiniatura: t.fotos.urlMiniatura,
      eventoId: t.eventos.id,
      eventoTitulo: t.eventos.titulo,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(and(eq(t.itensPedido.fotografoId, fotografoId), eq(t.pedidos.status, "pago")))
    // As linhas de um mesmo pedido vêm juntas: a data e depois o id separam os pedidos.
    .orderBy(desc(compradoEm), asc(t.pedidos.id), asc(t.fotos.ordem));

  const clientes = new Map<string, ClienteDoFotografo>();
  for (const l of linhas) {
    const excluida = ehEmailDeContaExcluida(l.email);
    const chave = l.email.trim().toLowerCase();
    const compradaEm = (l.pagoEm ?? l.criadoEm).toISOString();
    let cliente = clientes.get(chave);
    if (!cliente) {
      // A primeira linha de cada cliente é a compra mais recente (ordem da consulta).
      cliente = {
        chave,
        nome: excluida ? NOME_CONTA_EXCLUIDA : l.nome,
        email: excluida ? null : l.email,
        compras: [],
        totalFotos: 0,
        ultimaCompraEm: compradaEm,
      };
      clientes.set(chave, cliente);
    }
    let compra = cliente.compras.at(-1);
    if (compra?.pedidoId !== l.pedidoId) {
      compra = { pedidoId: l.pedidoId, compradaEm, fotos: [] };
      cliente.compras.push(compra);
    }
    compra.fotos.push({
      fotoId: l.fotoId,
      eventoId: l.eventoId,
      eventoTitulo: l.eventoTitulo,
      nomeArquivo: l.nomeArquivo,
      tipo: l.tipo,
      urlMiniatura: urlPublica(l.urlMiniatura),
    });
    cliente.totalFotos++;
  }
  return [...clientes.values()];
}
