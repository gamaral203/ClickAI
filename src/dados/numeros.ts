// Números de peito das fotos (tabela `numeros`): gravados pela leitura (src/servicos/numeros.ts)
// ou pelo fotógrafo no painel, e lidos pela busca por número na página do evento.

import "server-only";

import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { normalizarNumero, type NumeroLido } from "@/lib/numeros-de-peito";

/**
 * Grava os números lidos numa foto e marca a foto como lida, mesmo sem nenhum número (assim ela
 * não volta à leitura). Idempotente: os números lidos antes saem e entram os de agora; os postos
 * à mão pelo fotógrafo ficam.
 */
export async function salvarNumerosLidos(fotoId: string, numeros: NumeroLido[]) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx
      .delete(t.numeros)
      .where(and(eq(t.numeros.fotoId, fotoId), eq(t.numeros.manual, false)));
    if (numeros.length > 0) {
      await tx
        .insert(t.numeros)
        .values(
          numeros.map((n) => ({
            fotoId,
            numero: n.numero,
            confianca: n.confianca,
            caixa: n.caixa,
          })),
        )
        // O mesmo número já posto à mão continua manual.
        .onConflictDoNothing();
    }
    await tx.update(t.fotos).set({ numerosLidosEm: new Date() }).where(eq(t.fotos.id, fotoId));
  });
}

/** O evento está com a leitura do número de peito ligada? */
export async function leituraDeNumerosLigada(eventoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ ligada: t.eventos.lerNumeros })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  return linha?.ligada ?? false;
}

/** Fotos (não vídeos) prontas e não excluídas: as que passam pela leitura. */
const FOTO_LEGIVEL = (eventoId: string) =>
  and(
    eq(t.fotos.eventoId, eventoId),
    eq(t.fotos.status, "pronta"),
    eq(t.fotos.tipo, "foto"),
    isNull(t.fotos.excluidaEm),
  );

/** Nomes por extenso: dentro do sql``, o Drizzle tira o nome da tabela (ver TEM_ROSTO). */
const TEM_NUMERO = sql`exists (select 1 from "numeros" where "numeros"."foto_id" = "fotos"."id")`;

/** Quantas fotos do evento têm número, e quantas ainda não passaram pela leitura. */
export async function situacaoDosNumeros(eventoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      prontas: sql<number>`count(*)::int`,
      comNumero: sql<number>`count(*) filter (where ${TEM_NUMERO})::int`,
      pendentes: sql<number>`count(*) filter (where ${t.fotos.numerosLidosEm} is null)::int`,
    })
    .from(t.fotos)
    .where(FOTO_LEGIVEL(eventoId));
  return {
    prontas: linha?.prontas ?? 0,
    comNumero: linha?.comNumero ?? 0,
    pendentes: linha?.pendentes ?? 0,
  };
}

/**
 * Próximas fotos do evento (em ordem de id, depois de `depoisDe`) que ainda não passaram pela
 * leitura do número: enviadas antes de a opção ser ligada, ou em que a leitura falhou.
 */
export async function fotosParaLerNumeros(
  eventoId: string,
  depoisDe: string | null,
  limite: number,
) {
  const banco = await obterBanco();
  return banco
    .select({ id: t.fotos.id, chaveOriginal: t.fotos.chaveOriginal })
    .from(t.fotos)
    .where(
      and(
        FOTO_LEGIVEL(eventoId),
        isNull(t.fotos.numerosLidosEm),
        depoisDe ? gt(t.fotos.id, depoisDe) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
}

/**
 * Fotos de qualquer evento com a leitura ligada que ainda não foram lidas e estão prontas desde
 * antes de `prontasAntesDe` (as recentes ainda podem estar na leitura do próprio envio), para o
 * job de revisão.
 */
export async function fotosPendentesDeNumeros(prontasAntesDe: Date, limite: number) {
  const banco = await obterBanco();
  return banco
    .select({ id: t.fotos.id, eventoId: t.fotos.eventoId, chaveOriginal: t.fotos.chaveOriginal })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        eq(t.eventos.lerNumeros, true),
        eq(t.fotos.status, "pronta"),
        eq(t.fotos.tipo, "foto"),
        isNull(t.fotos.excluidaEm),
        isNull(t.fotos.numerosLidosEm),
        isNotNull(t.fotos.chaveOriginal),
        lt(t.fotos.criadoEm, prontasAntesDe),
      ),
    )
    .orderBy(asc(t.fotos.criadoEm))
    .limit(limite);
}

/** Números de cada foto do evento (`{ fotoId: ["123", ...] }`), para o painel. */
export async function numerosDasFotosDoEvento(eventoId: string): Promise<Map<string, string[]>> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ fotoId: t.numeros.fotoId, numero: t.numeros.numero })
    .from(t.numeros)
    .innerJoin(t.fotos, eq(t.fotos.id, t.numeros.fotoId))
    .where(eq(t.fotos.eventoId, eventoId))
    .orderBy(asc(t.numeros.numero));
  const porFoto = new Map<string, string[]>();
  for (const l of linhas) {
    const lista = porFoto.get(l.fotoId);
    if (lista) lista.push(l.numero);
    else porFoto.set(l.fotoId, [l.numero]);
  }
  return porFoto;
}

export type CorrecaoDeNumero = { acao: "adicionar" | "remover"; numero: string };
export type ResultadoCorrecao =
  | { ok: true; eventoId: string; numeros: string[] }
  | { ok: false; erro: "nao_encontrada" | "numero_invalido" };

/**
 * Correção manual do número de uma foto. Pode o dono do evento (qualquer foto dele) e o
 * colaborador que aceitou o convite (só nas fotos que ele enviou); para os demais, a foto "não
 * existe". O número posto à mão fica marcado como manual e sobrevive à releitura.
 */
export async function corrigirNumeroDaFoto(
  fotoId: string,
  fotografoId: string,
  correcao: CorrecaoDeNumero,
): Promise<ResultadoCorrecao> {
  const numero = normalizarNumero(correcao.numero);
  if (numero === null) return { ok: false, erro: "numero_invalido" };
  const banco = await obterBanco();
  const [foto] = await banco
    .select({
      id: t.fotos.id,
      eventoId: t.fotos.eventoId,
      enviadaPor: t.fotos.enviadaPor,
      dono: t.eventos.fotografoId,
      tipo: t.fotos.tipo,
      colaborador: t.colaboradores.id,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .leftJoin(
      t.colaboradores,
      and(
        eq(t.colaboradores.eventoId, t.fotos.eventoId),
        eq(t.colaboradores.fotografoId, fotografoId),
        isNotNull(t.colaboradores.aceitoEm),
      ),
    )
    .where(and(eq(t.fotos.id, fotoId), isNull(t.fotos.excluidaEm)));
  const pode =
    foto &&
    foto.tipo === "foto" &&
    (foto.dono === fotografoId || (foto.colaborador !== null && foto.enviadaPor === fotografoId));
  if (!pode) return { ok: false, erro: "nao_encontrada" };

  if (correcao.acao === "adicionar") {
    await banco
      .insert(t.numeros)
      .values({ fotoId, numero, manual: true })
      .onConflictDoUpdate({
        target: [t.numeros.fotoId, t.numeros.numero],
        set: { manual: true },
      });
  } else {
    await banco
      .delete(t.numeros)
      .where(and(eq(t.numeros.fotoId, fotoId), eq(t.numeros.numero, numero)));
  }
  const linhas = await banco
    .select({ numero: t.numeros.numero })
    .from(t.numeros)
    .where(eq(t.numeros.fotoId, fotoId))
    .orderBy(asc(t.numeros.numero));
  return { ok: true, eventoId: foto.eventoId, numeros: linhas.map((l) => l.numero) };
}

/** Ids das fotos do evento que têm algum dos números (para a busca). */
export async function fotosComNumeros(eventoId: string, numeros: string[]) {
  if (numeros.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .selectDistinct({ fotoId: t.numeros.fotoId })
    .from(t.numeros)
    .innerJoin(t.fotos, eq(t.fotos.id, t.numeros.fotoId))
    .where(and(inArray(t.numeros.numero, numeros), eq(t.fotos.eventoId, eventoId)));
  return linhas.map((l) => l.fotoId);
}
