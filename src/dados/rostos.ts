// Rostos encontrados nas fotos (tabela `rostos`): gravados quando a foto fica pronta e lidos na
// busca por selfie, para mostrar a prévia ampliada no rosto da pessoa.

import "server-only";

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type CaixaDoRosto = { esquerda: number; topo: number; largura: number; altura: number };

/** Grava os rostos que o provedor encontrou numa foto. */
export async function salvarRostos(
  fotoId: string,
  rostos: { rostoId: string; caixa: CaixaDoRosto | null }[],
) {
  if (rostos.length === 0) return;
  const banco = await obterBanco();
  await banco
    .insert(t.rostos)
    .values(rostos.map((r) => ({ fotoId, rostoIdProvedor: r.rostoId, caixa: r.caixa })));
}

/**
 * Posição do rosto encontrado pela busca em cada foto: `{ fotoId: caixa }`. Fotos sem posição
 * gravada (como as de exemplo) ficam de fora e aparecem inteiras.
 */
export async function caixasDosRostos(rostoIds: string[]): Promise<Record<string, CaixaDoRosto>> {
  if (rostoIds.length === 0) return {};
  const banco = await obterBanco();
  const linhas = await banco
    .select({ fotoId: t.rostos.fotoId, caixa: t.rostos.caixa })
    .from(t.rostos)
    .where(inArray(t.rostos.rostoIdProvedor, rostoIds));
  const caixas: Record<string, CaixaDoRosto> = {};
  for (const l of linhas) if (l.caixa && !caixas[l.fotoId]) caixas[l.fotoId] = l.caixa;
  return caixas;
}

/**
 * A foto tem rosto gravado. Nomes escritos por extenso: dentro do sql``, o Drizzle escreve a
 * coluna sem a tabela ("foto_id" = "id"), e na subconsulta os dois viravam colunas de `rostos`:
 * a conta dava sempre 0 e toda foto voltava ao reconhecimento a cada clique.
 */
const TEM_ROSTO = sql`exists (select 1 from "rostos" where "rostos"."foto_id" = "fotos"."id")`;

/** Quantas fotos prontas do evento têm rosto cadastrado na busca por selfie. */
export async function situacaoDosRostos(eventoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      prontas: sql<number>`count(*)::int`,
      comRosto: sql<number>`count(*) filter (where ${TEM_ROSTO})::int`,
    })
    .from(t.fotos)
    .where(
      and(eq(t.fotos.eventoId, eventoId), eq(t.fotos.status, "pronta"), eq(t.fotos.tipo, "foto")),
    );
  return { prontas: linha?.prontas ?? 0, comRosto: linha?.comRosto ?? 0 };
}

/**
 * Próximas fotos prontas do evento (em ordem de id, depois de `depoisDe`) para cadastrar os
 * rostos: as enviadas antes do reconhecimento estar ligado ou em que ele falhou. As que já têm
 * rosto cadastrado vêm marcadas, para não indexar duas vezes.
 */
export async function fotosParaIndexar(eventoId: string, depoisDe: string | null, limite: number) {
  const banco = await obterBanco();
  return banco
    .select({
      id: t.fotos.id,
      chaveOriginal: t.fotos.chaveOriginal,
      temRosto: sql<boolean>`${TEM_ROSTO}`,
    })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        eq(t.fotos.status, "pronta"),
        eq(t.fotos.tipo, "foto"),
        depoisDe ? gt(t.fotos.id, depoisDe) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
}
