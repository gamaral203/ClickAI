// Rostos encontrados nas fotos (tabela `rostos`): gravados quando a foto fica pronta e lidos na
// busca por selfie, para mostrar a prévia ampliada no rosto da pessoa.

import "server-only";

import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

export type CaixaDoRosto = { esquerda: number; topo: number; largura: number; altura: number };

/**
 * Grava os rostos que o provedor encontrou numa foto e marca a foto como cadastrada, mesmo sem
 * nenhum rosto: assim ela não volta ao reconhecimento no "Cadastrar rostos que faltam".
 */
export async function salvarRostos(
  fotoId: string,
  rostos: { rostoId: string; caixa: CaixaDoRosto | null }[],
) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    if (rostos.length > 0) {
      await tx
        .insert(t.rostos)
        .values(rostos.map((r) => ({ fotoId, rostoIdProvedor: r.rostoId, caixa: r.caixa })));
    }
    await tx.update(t.fotos).set({ rostosIndexadosEm: new Date() }).where(eq(t.fotos.id, fotoId));
  });
}

/** Ids, no provedor, dos rostos gravados nas fotos do evento (para apagá-los da coleção). */
export async function rostosDoEvento(eventoId: string) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ rostoId: t.rostos.rostoIdProvedor })
    .from(t.rostos)
    .innerJoin(t.fotos, eq(t.fotos.id, t.rostos.fotoId))
    .where(eq(t.fotos.eventoId, eventoId));
  return linhas.map((l) => l.rostoId);
}

/**
 * Apaga os rostos gravados das fotos do evento e tira a marca de cadastrada, para o evento
 * inteiro voltar ao reconhecimento.
 */
export async function limparRostosDoEvento(eventoId: string) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    const fotosDoEvento = tx
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(eq(t.fotos.eventoId, eventoId));
    await tx.delete(t.rostos).where(inArray(t.rostos.fotoId, fotosDoEvento));
    await tx.update(t.fotos).set({ rostosIndexadosEm: null }).where(eq(t.fotos.eventoId, eventoId));
  });
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

/**
 * Quantas fotos prontas do evento têm rosto cadastrado na busca por selfie, e quantas ainda não
 * passaram pelo reconhecimento.
 */
export async function situacaoDosRostos(eventoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      prontas: sql<number>`count(*)::int`,
      comRosto: sql<number>`count(*) filter (where ${TEM_ROSTO})::int`,
      pendentes: sql<number>`count(*) filter (where ${t.fotos.rostosIndexadosEm} is null)::int`,
    })
    .from(t.fotos)
    .where(
      and(eq(t.fotos.eventoId, eventoId), eq(t.fotos.status, "pronta"), eq(t.fotos.tipo, "foto")),
    );
  return {
    prontas: linha?.prontas ?? 0,
    comRosto: linha?.comRosto ?? 0,
    pendentes: linha?.pendentes ?? 0,
  };
}

/**
 * Próximas fotos prontas do evento (em ordem de id, depois de `depoisDe`) que ainda não passaram
 * pelo reconhecimento: as enviadas antes dele estar ligado ou em que ele falhou. As já
 * cadastradas (`rostos_indexados_em`), com ou sem rosto, ficam de fora.
 */
export async function fotosParaIndexar(eventoId: string, depoisDe: string | null, limite: number) {
  const banco = await obterBanco();
  return banco
    .select({ id: t.fotos.id, chaveOriginal: t.fotos.chaveOriginal })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        eq(t.fotos.status, "pronta"),
        eq(t.fotos.tipo, "foto"),
        isNull(t.fotos.rostosIndexadosEm),
        depoisDe ? gt(t.fotos.id, depoisDe) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
}
