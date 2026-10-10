// Liberação das fotos por lote (docs/arquitetura.md, "Liberação das fotos"). Cada foto guarda o
// próprio horário em `fotos.liberar_em`; as consultas públicas (src/dados/index.ts) comparam com a
// hora da requisição. Aqui ficam o que o painel do dono muda (liberar agora, agendar, cancelar),
// o resumo do topo do evento e o aviso de lote agendado liberado, que o job de pedidos manda.
//
// Quem decide a liberação é o dono do evento: toda função que muda recebe o id dele e só mexe
// em fotos de evento dele (o WHERE confere o dono). O colaborador envia seguindo o padrão do
// evento e vê o estado das próprias fotos, mas não libera nem agenda.

import "server-only";

import { and, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { liberacaoDoLote, type EscolhaLiberacao, type LiberacaoDaFoto } from "@/lib/liberacao";

import { iso } from "./mapas";

/**
 * Hora desta requisição, para o painel comparar com `liberar_em`. Espera a requisição antes
 * (`connection`): com Cache Components, o Next não deixa ler o relógio na pré-renderização.
 */
export async function horaDaRequisicao() {
  await connection();
  return Date.now();
}

async function donoDoEvento(eventoId: string) {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({
      dono: t.eventos.fotografoId,
      liberacao: t.eventos.liberacao,
      liberadoEm: t.eventos.liberadoEm,
    })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  return evento ?? null;
}

/**
 * Liberação das fotos de um envio, calculada no servidor: o dono pode escolher uma para o lote;
 * o colaborador segue sempre o padrão do evento (a escolha dele é ignorada). Devolve `null` se o
 * fotógrafo não pode enviar ao evento (nem dono, nem colaborador que aceitou).
 */
export async function liberacaoParaEnvio(
  eventoId: string,
  fotografoId: string,
  escolha: EscolhaLiberacao | null,
  agora = Date.now(),
): Promise<LiberacaoDaFoto | null> {
  const evento = await donoDoEvento(eventoId);
  if (!evento) return null;
  const padrao = { liberacao: evento.liberacao, liberadoEm: iso(evento.liberadoEm) };
  if (evento.dono === fotografoId) return liberacaoDoLote(padrao, escolha, agora);
  const banco = await obterBanco();
  const [colaborador] = await banco
    .select({ id: t.colaboradores.id })
    .from(t.colaboradores)
    .where(
      and(
        eq(t.colaboradores.eventoId, eventoId),
        eq(t.colaboradores.fotografoId, fotografoId),
        isNotNull(t.colaboradores.aceitoEm),
      ),
    );
  if (!colaborador) return null;
  return liberacaoDoLote(padrao, null, agora);
}

export type ResumoLiberacao = {
  liberadas: number;
  agendadas: number;
  /** Próximo horário agendado (ISO), ou `null`. */
  proximaEm: string | null;
  /** Aguardando o "Liberar agora" (manual). */
  aguardando: number;
};

/** Resumo da liberação das fotos prontas do evento, para o topo da página no painel. */
export async function resumoDaLiberacao(eventoId: string, agora: number): Promise<ResumoLiberacao> {
  const banco = await obterBanco();
  const momento = new Date(agora).toISOString();
  const [linha] = await banco
    .select({
      liberadas: sql<number>`count(*) filter (where ${t.fotos.liberarEm} <= ${momento}::timestamptz)::int`,
      agendadas: sql<number>`count(*) filter (where ${t.fotos.liberarEm} > ${momento}::timestamptz)::int`,
      aguardando: sql<number>`count(*) filter (where ${t.fotos.liberarEm} is null)::int`,
      proximaEm: sql<
        string | null
      >`min(${t.fotos.liberarEm}) filter (where ${t.fotos.liberarEm} > ${momento}::timestamptz)`,
    })
    .from(t.fotos)
    .where(
      and(eq(t.fotos.eventoId, eventoId), eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm)),
    );
  return {
    liberadas: linha?.liberadas ?? 0,
    agendadas: linha?.agendadas ?? 0,
    aguardando: linha?.aguardando ?? 0,
    proximaEm: linha?.proximaEm ? new Date(linha.proximaEm).toISOString() : null,
  };
}

export type MudancaLiberacao =
  { acao: "liberar" } | { acao: "agendar"; em: Date } | { acao: "cancelar" };

/**
 * Muda a liberação das fotos ainda não liberadas de um evento do dono: todas (`fotoIds` nulo) ou
 * só as escolhidas. Foto já liberada não volta a ficar escondida (alguém pode tê-la no carrinho).
 * - liberar: aparece agora (antecipa o agendamento ou libera a manual);
 * - agendar: aparece em `em` (o horário no futuro é conferido por quem chama);
 * - cancelar: só as agendadas voltam a aguardar o dono (manual).
 * Devolve quantas fotos mudaram, ou `null` se o evento não é deste fotógrafo.
 */
export async function mudarLiberacao(
  eventoId: string,
  donoId: string,
  mudanca: MudancaLiberacao,
  fotoIds: string[] | null,
  agora: number,
): Promise<number | null> {
  const evento = await donoDoEvento(eventoId);
  if (!evento || evento.dono !== donoId) return null;
  if (fotoIds && fotoIds.length === 0) return 0;
  const momento = new Date(agora);
  const banco = await obterBanco();
  const naoLiberada = or(isNull(t.fotos.liberarEm), gt(t.fotos.liberarEm, momento));
  const alvo = and(
    eq(t.fotos.eventoId, eventoId),
    isNull(t.fotos.excluidaEm),
    mudanca.acao === "cancelar" ? gt(t.fotos.liberarEm, momento) : naoLiberada,
    fotoIds ? inArray(t.fotos.id, fotoIds) : undefined,
  );
  const valores =
    mudanca.acao === "liberar"
      ? // Liberada pelo próprio dono: não precisa de aviso.
        { liberacao: "manual" as const, liberarEm: momento, avisoLiberacaoEm: momento }
      : mudanca.acao === "agendar"
        ? { liberacao: "agendada" as const, liberarEm: mudanca.em, avisoLiberacaoEm: null }
        : { liberacao: "manual" as const, liberarEm: null, avisoLiberacaoEm: null };
  const linhas = await banco.update(t.fotos).set(valores).where(alvo).returning({ id: t.fotos.id });
  return linhas.length;
}

/**
 * O dono mudou o horário padrão da liberação agendada do evento: as fotos ainda agendadas para o
 * horário antigo (as que seguiam o padrão) vão para o novo. Lotes agendados para outro horário
 * não mudam.
 */
export async function moverAgendamentoPadrao(
  eventoId: string,
  donoId: string,
  de: Date,
  para: Date,
  agora: number,
): Promise<number> {
  const evento = await donoDoEvento(eventoId);
  if (!evento || evento.dono !== donoId || de.getTime() <= agora) return 0;
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.fotos)
    .set({ liberacao: "agendada", liberarEm: para, avisoLiberacaoEm: null })
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        eq(t.fotos.liberacao, "agendada"),
        isNull(t.fotos.excluidaEm),
        eq(t.fotos.liberarEm, de),
      ),
    )
    .returning({ id: t.fotos.id });
  return linhas.length;
}

// ---------------------------------------------------------------- Aviso de lote liberado

export type AvisoDeLiberacao = {
  eventoId: string;
  titulo: string;
  slug: string;
  /** Fotos prontas do lote que acabou de ser liberado. */
  fotos: number;
  /** Dono e colaboradores que aceitaram, com conta ativa. */
  destinatarios: { nome: string; email: string }[];
};

/**
 * Lotes agendados que já chegaram ao horário e ainda não foram avisados: marca
 * `aviso_liberacao_em` (UPDATE … RETURNING, então duas execuções do job ao mesmo tempo não avisam
 * duas vezes) e devolve um aviso por evento publicado, para o dono e os colaboradores.
 */
export async function marcarLotesLiberadosParaAviso(agora: number): Promise<AvisoDeLiberacao[]> {
  const banco = await obterBanco();
  const momento = new Date(agora);
  const marcadas = await banco
    .update(t.fotos)
    .set({ avisoLiberacaoEm: momento })
    .where(
      and(
        eq(t.fotos.liberacao, "agendada"),
        isNull(t.fotos.avisoLiberacaoEm),
        lte(t.fotos.liberarEm, momento),
      ),
    )
    .returning({
      eventoId: t.fotos.eventoId,
      status: t.fotos.status,
      excluida: t.fotos.excluidaEm,
    });
  const porEvento = new Map<string, number>();
  for (const f of marcadas) {
    if (f.status !== "pronta" || f.excluida) continue;
    porEvento.set(f.eventoId, (porEvento.get(f.eventoId) ?? 0) + 1);
  }
  if (porEvento.size === 0) return [];

  const ids = [...porEvento.keys()];
  const [eventos, pessoas] = await Promise.all([
    banco
      .select({
        id: t.eventos.id,
        titulo: t.eventos.titulo,
        slug: t.eventos.slug,
        status: t.eventos.status,
        dono: t.eventos.fotografoId,
      })
      .from(t.eventos)
      .where(inArray(t.eventos.id, ids)),
    banco
      .select({
        eventoId: t.colaboradores.eventoId,
        fotografoId: t.colaboradores.fotografoId,
      })
      .from(t.colaboradores)
      .where(and(inArray(t.colaboradores.eventoId, ids), isNotNull(t.colaboradores.aceitoEm))),
  ]);
  const fotografoIds = [
    ...new Set([...eventos.map((e) => e.dono), ...pessoas.map((p) => p.fotografoId)]),
  ];
  const contas =
    fotografoIds.length === 0
      ? []
      : await banco
          .select({ id: t.fotografos.id, nome: t.fotografos.nomePublico, email: t.usuarios.email })
          .from(t.fotografos)
          .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId))
          .where(and(inArray(t.fotografos.id, fotografoIds), isNull(t.usuarios.excluidoEm)));
  const conta = new Map(contas.map((c) => [c.id, c]));

  // Evento fora do ar (rascunho, arquivado, em revisão): as fotos não aparecem, então não avisa.
  return eventos
    .filter((e) => e.status === "publicado")
    .map((e) => ({
      eventoId: e.id,
      titulo: e.titulo,
      slug: e.slug,
      fotos: porEvento.get(e.id) ?? 0,
      destinatarios: [
        e.dono,
        ...pessoas.filter((p) => p.eventoId === e.id).map((p) => p.fotografoId),
      ].flatMap((id) => {
        const c = conta.get(id);
        return c ? [{ nome: c.nome, email: c.email }] : [];
      }),
    }));
}
