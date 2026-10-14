// Busca por rosto no painel do fotógrafo (src/servicos/busca-por-rosto.ts): os eventos em que ele
// pode buscar e as fotos encontradas, separadas entre as dele e as de outros autores.
//
// Eventos permitidos: os que ele criou e aqueles em que colabora com o convite aceito
// (`colaboradores.aceito_em`). Pendente, recusado ou removido não entram.
//
// Fotos devolvidas, sempre presas ao evento conferido e aos ids que o provedor achou:
//   - as DELE (`fotos.enviada_por` = ele): prontas e não excluídas, liberadas ou não (é o
//     trabalho dele); o painel oferece "Baixar original" e o link público;
//   - as de OUTROS autores (o dono ou outro colaborador): só as que o público já vê (evento
//     publicado, foto pronta, não excluída e liberada), com a prévia pública, que tem marca
//     d'água. É a mesma regra da capa pública que o colaborador vê em "Meus eventos": ele não vê
//     fotos ainda fechadas de outro autor, e ninguém recebe o original de outro autor.

import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

import type { TipoItem } from "./tipos";

export type EventoDaBusca = {
  id: string;
  titulo: string;
  slug: string;
  inicioEm: string;
  /** `null` se o evento é dele; o nome do dono, se ele colabora. */
  donoNome: string | null;
};

/** Eventos em que o fotógrafo pode buscar, do mais recente para o mais antigo. */
export async function eventosDaBuscaPorRosto(fotografoId: string): Promise<EventoDaBusca[]> {
  const banco = await obterBanco();
  // `colaboradores` é único por (evento, fotógrafo): o LEFT JOIN não repete o evento.
  const linhas = await banco
    .select({
      id: t.eventos.id,
      titulo: t.eventos.titulo,
      slug: t.eventos.slug,
      inicioEm: t.eventos.inicioEm,
      donoId: t.eventos.fotografoId,
      donoNome: t.fotografos.nomePublico,
    })
    .from(t.eventos)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.eventos.fotografoId))
    .leftJoin(
      t.colaboradores,
      and(
        eq(t.colaboradores.eventoId, t.eventos.id),
        eq(t.colaboradores.fotografoId, fotografoId),
        isNotNull(t.colaboradores.aceitoEm),
      ),
    )
    .where(or(eq(t.eventos.fotografoId, fotografoId), isNotNull(t.colaboradores.id)))
    .orderBy(desc(t.eventos.inicioEm), desc(t.eventos.id));
  return linhas.map((l) => ({
    id: l.id,
    titulo: l.titulo,
    slug: l.slug,
    inicioEm: l.inicioEm.toISOString(),
    donoNome: l.donoId === fotografoId ? null : l.donoNome,
  }));
}

export type FotoDaBusca = {
  id: string;
  eventoId: string;
  tipo: TipoItem;
  nomeArquivo: string;
  /** Pública, com marca d'água. */
  urlMiniatura: string;
  urlPrevia: string;
  largura: number;
  altura: number;
  /** Já aparece para o público (o link da foto abre). */
  liberada: boolean;
  /** Foto enviada pelo próprio fotógrafo. */
  propria: boolean;
  /** Nome público do autor (para "foto de {autor}" nas de outros autores). */
  autorNome: string;
};

/**
 * Fotos do evento entre os ids encontrados, como descrito no topo: as do fotógrafo e as de outros
 * autores que o público já vê. Ids de outro evento, excluídos ou ainda fechados de outro autor
 * não voltam.
 */
export async function fotosDaBuscaPorRosto(
  fotografoId: string,
  eventoId: string,
  fotoIds: string[],
  instante: number,
): Promise<FotoDaBusca[]> {
  if (fotoIds.length === 0) return [];
  const banco = await obterBanco();
  const agora = new Date(instante);
  const linhas = await banco
    .select({
      id: t.fotos.id,
      eventoId: t.fotos.eventoId,
      tipo: t.fotos.tipo,
      nomeArquivo: t.fotos.nomeArquivo,
      urlMiniatura: t.fotos.urlMiniatura,
      urlPrevia: t.fotos.urlPrevia,
      largura: t.fotos.largura,
      altura: t.fotos.altura,
      liberarEm: t.fotos.liberarEm,
      enviadaPor: t.fotos.enviadaPor,
      autorNome: t.fotografos.nomePublico,
      statusEvento: t.eventos.status,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.fotos.enviadaPor))
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        inArray(t.fotos.id, fotoIds),
        eq(t.fotos.status, "pronta"),
        isNull(t.fotos.excluidaEm),
        or(
          eq(t.fotos.enviadaPor, fotografoId),
          and(
            ne(t.fotos.enviadaPor, fotografoId),
            eq(t.eventos.status, "publicado"),
            isNotNull(t.fotos.liberarEm),
            lte(t.fotos.liberarEm, agora),
          ),
        ),
      ),
    )
    .orderBy(t.fotos.ordem);
  return linhas.map((l) => ({
    id: l.id,
    eventoId: l.eventoId,
    tipo: l.tipo,
    nomeArquivo: l.nomeArquivo,
    urlMiniatura: urlPublica(l.urlMiniatura),
    urlPrevia: urlPublica(l.urlPrevia),
    largura: l.largura,
    altura: l.altura,
    liberada:
      l.statusEvento === "publicado" && l.liberarEm !== null && l.liberarEm.getTime() <= instante,
    propria: l.enviadaPor === fotografoId,
    autorNome: l.autorNome,
  }));
}
