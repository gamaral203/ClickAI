// Regeração das prévias antigas (src/servicos/regerar-previas.ts). A versão da marca de cada foto
// está na própria chave da prévia (`...-v3.webp`; src/lib/marca-dagua.ts): sem coluna nova, a
// troca da chave no banco é o que marca a foto como feita.

import "server-only";

import { and, asc, count, desc, eq, like, not } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { SUFIXO_DA_VERSAO } from "@/lib/marca-dagua";

export type FotoComPreviaAntiga = {
  id: string;
  eventoId: string;
  enviadaPor: string;
  chaveOriginal: string;
  urlPrevia: string;
  urlMiniatura: string;
  tamanhoBytes: number | null;
};

/**
 * Condição das fotos com prévia de versão anterior: fotos (não vídeos) prontas, com o original
 * no R2 (`originais/`) e a prévia no bucket público (`previas/`) com uma versão na chave
 * (`-vN.webp`) diferente da atual. As da versão 1 (sem sufixo) ficam de fora: têm o mesmo
 * desenho da versão atual (src/lib/marca-dagua.ts), então regerar só gastaria tempo e R2.
 * Inclui as excluídas: quem comprou ainda vê a miniatura no pedido. Fotos de exemplo (caminhos
 * `/exemplo/...`) ficam de fora.
 */
function comPreviaAntiga(eventoId?: string) {
  return and(
    eq(t.fotos.tipo, "foto"),
    eq(t.fotos.status, "pronta"),
    like(t.fotos.chaveOriginal, "originais/%"),
    like(t.fotos.urlPrevia, "previas/%"),
    like(t.fotos.urlPrevia, "%-v%.webp"),
    not(like(t.fotos.urlPrevia, `%${SUFIXO_DA_VERSAO}`)),
    eventoId ? eq(t.fotos.eventoId, eventoId) : undefined,
  );
}

/**
 * Próximas fotos a regerar: as do evento mais recente primeiro (pela data do evento), na ordem
 * da galeria. Com `eventoId`, só as daquele evento.
 */
export async function listarFotosComPreviaAntiga(
  limite: number,
  eventoId?: string,
): Promise<FotoComPreviaAntiga[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.fotos.id,
      eventoId: t.fotos.eventoId,
      enviadaPor: t.fotos.enviadaPor,
      chaveOriginal: t.fotos.chaveOriginal,
      urlPrevia: t.fotos.urlPrevia,
      urlMiniatura: t.fotos.urlMiniatura,
      tamanhoBytes: t.fotos.tamanhoBytes,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(comPreviaAntiga(eventoId))
    .orderBy(desc(t.eventos.inicioEm), asc(t.fotos.eventoId), asc(t.fotos.ordem))
    .limit(limite);
  return linhas.map((l) => ({ ...l, chaveOriginal: l.chaveOriginal! }));
}

/** Quantas fotos ainda têm prévia de versão anterior (no evento, ou em todos). */
export async function contarFotosComPreviaAntiga(eventoId?: string): Promise<number> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ total: count() })
    .from(t.fotos)
    .where(comPreviaAntiga(eventoId));
  return linha?.total ?? 0;
}

/**
 * Aponta a foto para a prévia e a miniatura novas, só se ela ainda estiver com as antigas
 * (atômico: de duas chamadas ao mesmo tempo, só uma troca). `true` se esta chamada trocou.
 */
export async function trocarPreviaDaFoto(
  fotoId: string,
  antigas: { urlPrevia: string; urlMiniatura: string },
  novas: { urlPrevia: string; urlMiniatura: string },
): Promise<boolean> {
  const banco = await obterBanco();
  const trocadas = await banco
    .update(t.fotos)
    .set(novas)
    .where(
      and(
        eq(t.fotos.id, fotoId),
        eq(t.fotos.urlPrevia, antigas.urlPrevia),
        eq(t.fotos.urlMiniatura, antigas.urlMiniatura),
      ),
    )
    .returning({ id: t.fotos.id });
  return trocadas.length > 0;
}

/** Id do evento pelo endereço (qualquer situação: a regeração é uma tarefa interna). */
export async function eventoIdPeloSlug(slug: string): Promise<string | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(eq(t.eventos.slug, slug));
  return linha?.id ?? null;
}
