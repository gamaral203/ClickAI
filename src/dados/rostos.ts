// Rostos encontrados nas fotos (tabela `rostos`): gravados quando a foto fica pronta e lidos na
// busca por selfie, para mostrar a prévia ampliada no rosto da pessoa.

import "server-only";

import { inArray } from "drizzle-orm";

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
