// Consultas usadas por mais de um módulo da camada de dados.

import "server-only";

import { inArray } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

/** Eventos de cada cupom (tabela cupons_eventos). */
export async function eventosDosCupons(cupomIds: string[]) {
  if (cupomIds.length === 0) return new Map<string, string[]>();
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.cuponsEventos)
    .where(inArray(t.cuponsEventos.cupomId, cupomIds));
  const mapa = new Map<string, string[]>();
  for (const l of linhas) mapa.set(l.cupomId, [...(mapa.get(l.cupomId) ?? []), l.eventoId]);
  return mapa;
}
