// Regeração das prévias antigas (src/servicos/regerar-previas.ts). A versão da marca e a revisão
// da configuração de cada foto estão na própria chave da prévia (`...-v5-r2.webp`;
// src/lib/marca-dagua.ts): sem coluna nova, a troca da chave no banco é o que marca a foto como
// feita.

import "server-only";

import { and, asc, count, desc, eq, like, not, or } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { sufixoDaVersao, VERSAO_MINIMA_AUTOMATICA } from "@/lib/marca-dagua";

export type FotoComPreviaAntiga = {
  id: string;
  eventoId: string;
  enviadaPor: string;
  chaveOriginal: string;
  urlPrevia: string;
  urlMiniatura: string;
  tamanhoBytes: number | null;
  /** Onde está o original (Drive só em evento `hibrido`); a chave continua `originais/...`. */
  provedorOriginal: "r2" | "drive";
  driveArquivoId: string | null;
};

/**
 * O que a regeração refaz:
 *   - `minima` (sem pedido do gestor): só as versões abaixo de VERSAO_MINIMA_AUTOMATICA com
 *     sufixo (2 e 3, sem a prévia do celular). A versão 1 (sem sufixo) tinha o mesmo desenho da
 *     3, e a 4 já tem tudo: trocar o desenho delas é decisão do gestor;
 *   - `revisao` (o gestor confirmou em /admin/marca-dagua): toda prévia que não está na versão
 *     atual com a revisão em vigor (`-v5-r{revisão}.webp`), de qualquer versão.
 */
export type AlvoDaRegeracao = { tipo: "minima" } | { tipo: "revisao"; revisao: number };

function precisaRegerar(alvo: AlvoDaRegeracao) {
  if (alvo.tipo === "revisao") {
    return not(like(t.fotos.urlPrevia, `%${sufixoDaVersao(alvo.revisao)}`));
  }
  const antigas = Array.from({ length: VERSAO_MINIMA_AUTOMATICA - 2 }, (_, i) =>
    like(t.fotos.urlPrevia, `%-v${i + 2}.webp`),
  );
  return or(...antigas);
}

/**
 * Condição das fotos a regerar: fotos (não vídeos) prontas, com o original guardado (chave
 * `originais/`, no R2 ou no Drive), a prévia no bucket público (`previas/`) e a chave fora do alvo. Inclui as
 * excluídas: quem comprou ainda vê a miniatura no pedido. Fotos de exemplo (caminhos
 * `/exemplo/...`) ficam de fora.
 */
function comPreviaAntiga(alvo: AlvoDaRegeracao, eventoId?: string) {
  return and(
    eq(t.fotos.tipo, "foto"),
    eq(t.fotos.status, "pronta"),
    like(t.fotos.chaveOriginal, "originais/%"),
    like(t.fotos.urlPrevia, "previas/%"),
    precisaRegerar(alvo),
    eventoId ? eq(t.fotos.eventoId, eventoId) : undefined,
  );
}

/**
 * Próximas fotos a regerar: as do evento mais recente primeiro (pela data do evento), na ordem
 * da galeria. Com `eventoId`, só as daquele evento.
 */
export async function listarFotosComPreviaAntiga(
  alvo: AlvoDaRegeracao,
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
      provedorOriginal: t.fotos.provedorOriginal,
      driveArquivoId: t.fotos.driveArquivoId,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(comPreviaAntiga(alvo, eventoId))
    .orderBy(desc(t.eventos.inicioEm), asc(t.fotos.eventoId), asc(t.fotos.ordem))
    .limit(limite);
  return linhas.map((l) => ({ ...l, chaveOriginal: l.chaveOriginal! }));
}

/** Quantas fotos ainda estão fora do alvo (no evento, ou em todos). */
export async function contarFotosComPreviaAntiga(
  alvo: AlvoDaRegeracao,
  eventoId?: string,
): Promise<number> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ total: count() })
    .from(t.fotos)
    .where(comPreviaAntiga(alvo, eventoId));
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
