// Capa do evento: a imagem dos cartões (inicial, ranking, /eventos, perfil e loja do fotógrafo),
// da página do evento (prévia do link) e do material de divulgação.
//
// O dono pode escolher uma foto (`eventos.capa_foto_id`). A escolhida só vale enquanto estiver
// pronta, não excluída e liberada; senão, e quando ele não escolhe, vale a automática: uma foto
// liberada do evento, sorteada por um hash fixo de `foto.id || evento.id`. É "aleatória" entre
// eventos, mas sempre a mesma para o mesmo evento (não pisca nem quebra o cache do navegador),
// e só muda quando a própria foto sai (exclusão, ou deixa de estar liberada).
//
// A imagem é sempre a miniatura ou a prévia com marca d'água: o original nunca sai daqui.

import "server-only";

import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { urlPublica } from "@/lib/url-publica";

export type CapaDoEvento = {
  fotoId: string;
  /** A foto é a que o dono escolheu (e não a automática). */
  escolhida: boolean;
  urlMiniatura: string;
  /** Prévia com marca d'água; só nas fotos (no vídeo é o próprio vídeo, então fica `null`). */
  urlPrevia: string | null;
  largura: number;
  altura: number;
};

/** A foto é a capa escolhida do seu evento (e é foto, não vídeo). */
const ehEscolhida = sql<boolean>`coalesce(${t.fotos.id} = ${t.eventos.capaFotoId} and ${t.fotos.tipo} = 'foto', false)`;
/** Sorteio fixo por evento: muda de evento para evento, nunca entre carregamentos. */
const sorteioFixo = sql`md5(${t.fotos.id}::text || ${t.fotos.eventoId}::text)`;

/**
 * Capa de cada evento em `instante`, numa consulta só (DISTINCT ON por evento), para a página
 * inicial não fazer uma consulta por cartão. Ordem: a escolhida (se ainda valer), depois as
 * fotos antes dos vídeos, depois o sorteio fixo. Evento sem item liberado fica fora do mapa
 * (o cartão mostra o aviso de sempre).
 *
 * Não confere status do evento, senha nem "só após a busca": quem chama já passa só os eventos
 * publicados com a galeria aberta.
 */
export async function capasDosEventos(
  eventoIds: string[],
  instante: number,
): Promise<Map<string, CapaDoEvento>> {
  const mapa = new Map<string, CapaDoEvento>();
  if (eventoIds.length === 0) return mapa;
  const banco = await obterBanco();
  const linhas = await banco
    .selectDistinctOn([t.fotos.eventoId], {
      eventoId: t.fotos.eventoId,
      fotoId: t.fotos.id,
      tipo: t.fotos.tipo,
      escolhida: ehEscolhida,
      urlMiniatura: t.fotos.urlMiniatura,
      urlPrevia: t.fotos.urlPrevia,
      largura: t.fotos.largura,
      altura: t.fotos.altura,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        inArray(t.fotos.eventoId, eventoIds),
        eq(t.fotos.status, "pronta"),
        isNull(t.fotos.excluidaEm),
        isNotNull(t.fotos.liberarEm),
        lte(t.fotos.liberarEm, new Date(instante)),
      ),
    )
    .orderBy(
      t.fotos.eventoId,
      sql`${ehEscolhida} desc`,
      sql`(${t.fotos.tipo} = 'foto') desc`,
      sorteioFixo,
    );
  for (const l of linhas) {
    mapa.set(l.eventoId, {
      fotoId: l.fotoId,
      escolhida: l.escolhida,
      urlMiniatura: urlPublica(l.urlMiniatura),
      urlPrevia: l.tipo === "foto" ? urlPublica(l.urlPrevia) : null,
      largura: l.largura,
      altura: l.altura,
    });
  }
  return mapa;
}

/**
 * Fundo do material de divulgação (painel do dono): a escolhida, se pronta e não excluída;
 * senão a capa antiga gravada em `eventos.capa`; senão uma foto pronta pelo mesmo sorteio fixo,
 * preferindo as já liberadas. Devolve o que está gravado (chave do R2 da prévia com marca
 * d'água, ou caminho de exemplo), ou `null` se o evento ainda não tem foto.
 */
export async function previaDeCapaParaDivulgacao(eventoId: string): Promise<string | null> {
  const banco = await obterBanco();
  const agora = new Date().toISOString();
  const [foto] = await banco
    .select({ previa: t.fotos.urlPrevia, escolhida: ehEscolhida, capaAntiga: t.eventos.capa })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        eq(t.fotos.status, "pronta"),
        eq(t.fotos.tipo, "foto"),
        isNull(t.fotos.excluidaEm),
      ),
    )
    .orderBy(
      sql`${ehEscolhida} desc`,
      sql`coalesce(${t.fotos.liberarEm} <= ${agora}::timestamptz, false) desc`,
      sorteioFixo,
    )
    .limit(1);
  if (foto?.escolhida) return foto.previa;
  const [evento] = await banco
    .select({ capa: t.eventos.capa })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  return evento?.capa ?? foto?.previa ?? null;
}

export type ResultadoCapa = { ok: true } | { ok: false; motivo: "evento" | "foto" };

/**
 * Grava a capa escolhida (ou `null`, para voltar à automática). Só o dono do evento: o WHERE
 * confere `fotografo_id`, então colaborador e outro fotógrafo recebem "evento". A foto precisa
 * ser deste evento, uma foto (não vídeo), pronta e não excluída; pode ainda não estar liberada
 * (aí a automática vale até ela ser liberada).
 */
export async function definirCapaDoEvento(
  eventoId: string,
  fotografoId: string,
  fotoId: string | null,
): Promise<ResultadoCapa> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  if (!evento) return { ok: false, motivo: "evento" };
  if (fotoId) {
    const [foto] = await banco
      .select({ id: t.fotos.id })
      .from(t.fotos)
      .where(
        and(
          eq(t.fotos.id, fotoId),
          eq(t.fotos.eventoId, eventoId),
          eq(t.fotos.tipo, "foto"),
          eq(t.fotos.status, "pronta"),
          isNull(t.fotos.excluidaEm),
        ),
      );
    if (!foto) return { ok: false, motivo: "foto" };
  }
  await banco
    .update(t.eventos)
    .set({ capaFotoId: fotoId })
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return { ok: true };
}
