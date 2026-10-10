// Reserva das fotos em `processando` (docs/arquitetura.md, "Upload"). A mesma foto pode ser
// pedida ao mesmo tempo pelo navegador (logo depois do envio), pelo processamento em segundo
// plano (o navegador entregou a fila ao servidor) e pelo job de revisão. Só quem reserva a foto
// processa: os outros respondem que ela já está em andamento, sem gerar prévias de novo nem
// cadastrar os rostos duas vezes.
//
// A reserva usa a própria coluna `envio_iniciado_em`, que só serve para o job saber quando uma
// foto parada pode ser revisada: reservar é empurrar essa marca para o futuro (até quando a
// reserva vale). Enquanto ela está no futuro, ninguém mais reserva a foto e o job não a vê; se a
// função morrer no meio, a reserva vence sozinha e o job pega a foto depois.

import "server-only";

import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

const inicioDoEnvio = sql<Date>`coalesce(${t.fotos.envioIniciadoEm}, ${t.fotos.criadoEm})`;

/**
 * Reserva a foto para processar até `ate`, se ela ainda estiver em `processando`, for do
 * fotógrafo e ninguém a tiver reservado. Atômico (um UPDATE com a condição): de duas chamadas ao
 * mesmo tempo, só uma ganha. `true` se esta chamada ganhou.
 */
export async function reservarFotoParaProcessar(
  fotoId: string,
  fotografoId: string,
  agora: Date,
  ate: Date,
): Promise<boolean> {
  const banco = await obterBanco();
  const reservadas = await banco
    .update(t.fotos)
    .set({ envioIniciadoEm: ate })
    .where(
      and(
        eq(t.fotos.id, fotoId),
        eq(t.fotos.enviadaPor, fotografoId),
        eq(t.fotos.status, "processando"),
        isNull(t.fotos.excluidaEm),
        lte(inicioDoEnvio, agora),
      ),
    )
    .returning({ id: t.fotos.id });
  return reservadas.length > 0;
}

/**
 * Devolve a marca de início do envio (desfaz a reserva) de uma foto ainda em `processando`: o
 * arquivo ainda não chegou e o envio pode estar em andamento, então a foto volta para a fila do
 * job com o horário original, sem virar erro.
 */
export async function devolverReserva(fotoId: string, inicio: Date) {
  const banco = await obterBanco();
  await banco
    .update(t.fotos)
    .set({ envioIniciadoEm: inicio })
    .where(and(eq(t.fotos.id, fotoId), eq(t.fotos.status, "processando")));
}

/** Situação atual da foto do fotógrafo (para responder a quem chegou depois da reserva). */
export async function situacaoDaFoto(fotoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ status: t.fotos.status, erroMensagem: t.fotos.erroMensagem })
    .from(t.fotos)
    .where(
      and(eq(t.fotos.id, fotoId), eq(t.fotos.enviadaPor, fotografoId), isNull(t.fotos.excluidaEm)),
    );
  return linha ?? null;
}

/**
 * Situação de várias fotos do fotógrafo, para a tela de envio acompanhar as que entregou ao
 * servidor até ficarem prontas. Fotos de outra conta ou excluídas não voltam.
 */
export async function situacaoDasFotos(
  fotoIds: string[],
  fotografoId: string,
): Promise<
  { id: string; status: "processando" | "pronta" | "erro"; erroMensagem: string | null }[]
> {
  if (fotoIds.length === 0) return [];
  const banco = await obterBanco();
  return banco
    .select({ id: t.fotos.id, status: t.fotos.status, erroMensagem: t.fotos.erroMensagem })
    .from(t.fotos)
    .where(
      and(
        inArray(t.fotos.id, fotoIds),
        eq(t.fotos.enviadaPor, fotografoId),
        isNull(t.fotos.excluidaEm),
      ),
    );
}

/**
 * Fotos paradas em `processando` cujo envio começou (ou cuja reserva venceu) antes de
 * `antesDe`, as mais antigas primeiro, com o início do envio (para não marcar erro numa foto
 * cujo arquivo ainda pode estar subindo).
 */
export async function listarFotosParadas(
  antesDe: Date,
  limite: number,
): Promise<{ id: string; enviadaPor: string; inicio: Date }[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotos.id, enviadaPor: t.fotos.enviadaPor, inicio: inicioDoEnvio })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.status, "processando"),
        isNull(t.fotos.excluidaEm),
        eq(t.fotos.tipo, "foto"),
        lt(inicioDoEnvio, antesDe),
      ),
    )
    .orderBy(asc(inicioDoEnvio))
    .limit(limite);
  // O coalesce volta como texto em alguns drivers: normaliza para Date.
  return linhas.map((l) => ({ ...l, inicio: new Date(l.inicio) }));
}
