// Fila dos rostos (docs/arquitetura.md, "Upload"): fotos prontas que ainda não passaram pelo
// reconhecimento facial, e o limite de chamadas por segundo da conta inteira. A foto fica à venda
// sem esperar o rosto; esta fila é a garantia de que o rosto chega depois.

import "server-only";

import { and, asc, eq, gt, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

/**
 * Pega a próxima vaga de um limite de chamadas compartilhado por todas as instâncias, num UPSERT
 * atômico com o relógio do banco: cada chamada empurra `proximo_em` em `intervaloMs` e espera a
 * vez dela. Devolve quantos ms esperar, ou `null` se a fila já passa de `esperaMaximaMs` (quem
 * chamou desiste e deixa a foto para a fila, em vez de segurar uma função parada).
 */
export async function reservarVagaDoLimite(
  chave: string,
  intervaloMs: number,
  esperaMaximaMs: number,
): Promise<number | null> {
  const banco = await obterBanco();
  const coluna = sql`"limites_de_taxa"."proximo_em"`;
  const passo = sql`(${intervaloMs}::double precision * interval '1 millisecond')`;
  const teto = sql`(${esperaMaximaMs}::double precision * interval '1 millisecond')`;
  const [linha] = await banco
    .insert(t.limitesDeTaxa)
    .values({ chave, proximoEm: sql`now() + ${passo}` })
    .onConflictDoUpdate({
      target: t.limitesDeTaxa.chave,
      set: { proximoEm: sql`greatest(${coluna}, now()) + ${passo}` },
      where: sql`greatest(${coluna}, now()) <= now() + ${teto}`,
    })
    .returning({ ate: sql<number>`extract(epoch from (${coluna} - now())) * 1000` });
  if (!linha) return null;
  return Math.max(0, Number(linha.ate) - intervaloMs);
}

/** Condições da fila: foto pronta, sem rostos, na vez dela, com tentativas e evento em uso. */
function naFila(agora: Date, desde: Date, maximoDeTentativas: number) {
  return and(
    eq(t.fotos.status, "pronta"),
    isNull(t.fotos.rostosIndexadosEm),
    isNull(t.fotos.excluidaEm),
    isNotNull(t.fotos.chaveOriginal),
    lt(t.fotos.rostosTentativas, maximoDeTentativas),
    or(isNull(t.fotos.rostosTentarEm), lte(t.fotos.rostosTentarEm, agora)),
    // O envio antigo fica de fora (o botão "Cadastrar rostos que faltam" continua servindo a ele):
    // ligar a fila não pode virar uma conta surpresa no Rekognition.
    gt(t.fotos.criadoEm, desde),
    // Evento arquivado teve a coleção apagada de propósito e tem o caminho próprio de volta.
    isNull(t.eventos.rostosArquivadosEm),
  );
}

export async function haFotoSemRostos(
  agora: Date,
  desde: Date,
  maximoDeTentativas: number,
): Promise<boolean> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotos.id })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(naFila(agora, desde, maximoDeTentativas))
    .limit(1);
  return linhas.length > 0;
}

export async function listarFotosSemRostos(
  agora: Date,
  desde: Date,
  maximoDeTentativas: number,
  limite: number,
) {
  const banco = await obterBanco();
  return banco
    .select({
      id: t.fotos.id,
      eventoId: t.fotos.eventoId,
      chaveOriginal: t.fotos.chaveOriginal,
      tipo: t.fotos.tipo,
      tamanhoBytes: t.fotos.tamanhoBytes,
      tentativas: t.fotos.rostosTentativas,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(naFila(agora, desde, maximoDeTentativas))
    .orderBy(asc(t.fotos.criadoEm), asc(t.fotos.id))
    .limit(limite);
}

/**
 * Reserva a foto para o cadastro dos rostos até `ate`, e conta a tentativa. Atômico: de duas
 * execuções, só uma ganha. A marca `rostos_tentar_em` é ao mesmo tempo a reserva e a espera.
 */
export async function reservarFotoParaRostos(
  fotoId: string,
  agora: Date,
  ate: Date,
): Promise<boolean> {
  const banco = await obterBanco();
  const reservadas = await banco
    .update(t.fotos)
    .set({ rostosTentarEm: ate, rostosTentativas: sql`${t.fotos.rostosTentativas} + 1` })
    .where(
      and(
        eq(t.fotos.id, fotoId),
        eq(t.fotos.status, "pronta"),
        isNull(t.fotos.rostosIndexadosEm),
        isNull(t.fotos.excluidaEm),
        or(isNull(t.fotos.rostosTentarEm), lte(t.fotos.rostosTentarEm, agora)),
      ),
    )
    .returning({ id: t.fotos.id });
  return reservadas.length > 0;
}

/** A culpa não foi da foto (cota da conta, credencial): desfaz a tentativa e marca a volta. */
export async function devolverFotoDosRostos(fotoId: string, tentarEm: Date) {
  const banco = await obterBanco();
  await banco
    .update(t.fotos)
    .set({
      rostosTentarEm: tentarEm,
      rostosTentativas: sql`greatest(${t.fotos.rostosTentativas} - 1, 0)`,
    })
    .where(eq(t.fotos.id, fotoId));
}
