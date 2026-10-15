// Moldura do evento (docs/arquitetura.md, "Moldura do evento"): uma arte por formato (story e
// feed), enviada pelo dono do evento. Só o dono grava ou remove (WHERE em `fotografo_id`); ler
// quais formatos existem é público (a página do evento mostra um selo), mas a chave só sai
// daqui para o painel (como imagem de divulgação) e para a composição no servidor.

import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import type { FormatoMoldura } from "@/lib/moldura";

export type MoldurasDoEvento = Partial<Record<FormatoMoldura, string>>;

/** Chaves das molduras de um evento, por formato. */
export async function moldurasDoEvento(eventoId: string): Promise<MoldurasDoEvento> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ formato: t.moldurasEvento.formato, chave: t.moldurasEvento.chave })
    .from(t.moldurasEvento)
    .where(eq(t.moldurasEvento.eventoId, eventoId));
  return Object.fromEntries(linhas.map((l) => [l.formato, l.chave]));
}

/** Formatos com moldura de cada evento (os sem moldura ficam fora do mapa). */
export async function formatosDeMoldura(
  eventoIds: string[],
): Promise<Map<string, FormatoMoldura[]>> {
  const mapa = new Map<string, FormatoMoldura[]>();
  const ids = [...new Set(eventoIds)];
  if (ids.length === 0) return mapa;
  const banco = await obterBanco();
  const linhas = await banco
    .select({ eventoId: t.moldurasEvento.eventoId, formato: t.moldurasEvento.formato })
    .from(t.moldurasEvento)
    .where(inArray(t.moldurasEvento.eventoId, ids))
    .orderBy(t.moldurasEvento.formato);
  for (const l of linhas) mapa.set(l.eventoId, [...(mapa.get(l.eventoId) ?? []), l.formato]);
  return mapa;
}

/** O evento é do fotógrafo (só o dono mexe na moldura). */
export async function eventoEhDoDono(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return Boolean(evento);
}

export type ResultadoMoldura = { ok: true; anterior: string | null } | { ok: false };

/** Grava (ou troca) a moldura do formato. Devolve a chave anterior, para apagar o arquivo. */
export async function gravarMoldura(
  eventoId: string,
  fotografoId: string,
  formato: FormatoMoldura,
  chave: string,
): Promise<ResultadoMoldura> {
  if (!(await eventoEhDoDono(eventoId, fotografoId))) return { ok: false };
  const banco = await obterBanco();
  const anterior = (await moldurasDoEvento(eventoId))[formato] ?? null;
  await banco
    .insert(t.moldurasEvento)
    .values({ eventoId, formato, chave })
    .onConflictDoUpdate({
      target: [t.moldurasEvento.eventoId, t.moldurasEvento.formato],
      set: { chave, atualizadaEm: new Date() },
    });
  return { ok: true, anterior: anterior === chave ? null : anterior };
}

/** Remove a moldura do formato. Devolve a chave removida (ou `null`, se não havia). */
export async function removerMoldura(
  eventoId: string,
  fotografoId: string,
  formato: FormatoMoldura,
): Promise<ResultadoMoldura> {
  if (!(await eventoEhDoDono(eventoId, fotografoId))) return { ok: false };
  const banco = await obterBanco();
  const linhas = await banco
    .delete(t.moldurasEvento)
    .where(and(eq(t.moldurasEvento.eventoId, eventoId), eq(t.moldurasEvento.formato, formato)))
    .returning({ chave: t.moldurasEvento.chave });
  return { ok: true, anterior: linhas[0]?.chave ?? null };
}
