// Capa do evento: a imagem dos cartões (inicial, ranking, /eventos, perfil e loja do fotógrafo),
// da página do evento (prévia do link) e do material de divulgação.
//
// O dono pode enviar qualquer imagem (`eventos.capa`: a arte do evento, um cartaz), que vale
// sempre e aparece como está (é dele, não é foto à venda), ou escolher uma foto do evento
// (`eventos.capa_foto_id`). Uma escolha limpa a outra. A foto escolhida só vale enquanto estiver
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
  /** A foto do evento que é a capa; `null` quando a capa é uma imagem enviada. */
  fotoId: string | null;
  /** A foto é a que o dono escolheu (e não a automática). */
  escolhida: boolean;
  /** Imagem enviada pelo dono (não é foto do evento): aparece como está, sem marca. */
  enviada: boolean;
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

/** Medidas da imagem enviada: o servidor grava sempre em 3:2, o formato dos cartões. */
export const MEDIDAS_CAPA_ENVIADA = { largura: 1200, altura: 800 } as const;

/**
 * Imagens enviadas pelo dono (`eventos.capa`), já como capa pronta para os cartões. Não é foto à
 * venda, então vale também com a galeria fechada (só após a busca, aguardando liberação); quem
 * chama só não passa o evento com senha.
 */
export async function capasEnviadas(eventoIds: string[]): Promise<Map<string, CapaDoEvento>> {
  if (eventoIds.length === 0) return new Map();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.eventos.id, capa: t.eventos.capa })
    .from(t.eventos)
    .where(and(inArray(t.eventos.id, eventoIds), isNotNull(t.eventos.capa)));
  return new Map(
    linhas.map((l) => [
      l.id,
      {
        fotoId: null,
        escolhida: false,
        enviada: true,
        urlMiniatura: urlPublica(l.capa!),
        urlPrevia: urlPublica(l.capa!),
        ...MEDIDAS_CAPA_ENVIADA,
      },
    ]),
  );
}

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
      enviada: false,
      urlMiniatura: urlPublica(l.urlMiniatura),
      urlPrevia: l.tipo === "foto" ? urlPublica(l.urlPrevia) : null,
      largura: l.largura,
      altura: l.altura,
    });
  }
  // A imagem enviada pelo dono vale na frente de qualquer foto.
  for (const [eventoId, capa] of await capasEnviadas(eventoIds)) mapa.set(eventoId, capa);
  return mapa;
}

/**
 * Capa de cada evento para a lista "Meus eventos" do dono. Mesma ordem da pública (escolhida,
 * fotos antes de vídeos, sorteio fixo), mas sem exigir a liberação: o dono vê a capa do rascunho
 * e do evento agendado. Evento sem foto pronta fica fora do mapa.
 */
export async function capasParaODono(eventoIds: string[]): Promise<Map<string, CapaDoEvento>> {
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
      enviada: false,
      urlMiniatura: urlPublica(l.urlMiniatura),
      urlPrevia: l.tipo === "foto" ? urlPublica(l.urlPrevia) : null,
      largura: l.largura,
      altura: l.altura,
    });
  }
  // A imagem enviada pelo dono vale na frente de qualquer foto.
  for (const [eventoId, capa] of await capasEnviadas(eventoIds)) mapa.set(eventoId, capa);
  return mapa;
}

/**
 * Fundo do material de divulgação (painel do dono): a imagem enviada (`eventos.capa`); senão a
 * foto escolhida, se pronta e não excluída; senão uma foto pronta pelo mesmo sorteio fixo,
 * preferindo as já liberadas. Devolve o que está gravado (chave do R2, ou caminho de exemplo),
 * ou `null` se o evento ainda não tem foto.
 */
export async function previaDeCapaParaDivulgacao(eventoId: string): Promise<string | null> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ capa: t.eventos.capa })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  if (evento?.capa) return evento.capa;
  const agora = new Date().toISOString();
  const [foto] = await banco
    .select({ previa: t.fotos.urlPrevia, escolhida: ehEscolhida })
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
  return foto?.previa ?? null;
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
  // Escolher uma foto (ou remover) também tira a imagem enviada: só uma capa vale por vez.
  await banco
    .update(t.eventos)
    .set({ capaFotoId: fotoId, capa: null })
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return { ok: true };
}

/**
 * Grava a imagem enviada como capa (chave do R2 ou, sem R2, a própria imagem em data:) e tira a
 * foto escolhida. Só o dono do evento (WHERE em `fotografo_id`).
 */
export async function definirCapaEnviada(
  eventoId: string,
  fotografoId: string,
  valor: string,
): Promise<ResultadoCapa> {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.eventos)
    .set({ capa: valor, capaFotoId: null })
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)))
    .returning({ id: t.eventos.id });
  return linhas.length > 0 ? { ok: true } : { ok: false, motivo: "evento" };
}
