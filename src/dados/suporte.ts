// Chat de ajuda (uma conversa por usuário, ou por visitante sem conta) e sugestões de melhoria.

import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { iso } from "./mapas";
import type { TipoContatoSuporte } from "./suporte-tipos";

export { ROTULO_CONTATO_SUPORTE, type TipoContatoSuporte } from "./suporte-tipos";

export type AutorMensagemSuporte = "usuario" | "equipe";

export type MensagemSuporte = {
  id: string;
  autor: AutorMensagemSuporte;
  texto: string;
  criadoEm: string;
};

/** De quem é a conversa: a conta, ou o visitante sem conta (hash do cookie do chat). */
export type DonoDaConversa = { usuarioId: string } | { visitanteId: string };

function doDono(dono: DonoDaConversa) {
  return "usuarioId" in dono
    ? eq(t.conversasSuporte.usuarioId, dono.usuarioId)
    : eq(t.conversasSuporte.visitanteId, dono.visitanteId);
}

export type ConversaSuporte = {
  id: string;
  usuarioId: string | null;
  tipo: TipoContatoSuporte;
  nome: string;
  email: string;
  naoLidaPelaEquipe: boolean;
  naoLidaPeloUsuario: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

function paraConversa(r: typeof t.conversasSuporte.$inferSelect): ConversaSuporte {
  // O hash do visitante fica só no banco.
  const { visitanteId, ...resto } = r;
  void visitanteId;
  return { ...resto, criadoEm: iso(r.criadoEm), atualizadoEm: iso(r.atualizadoEm) };
}

function paraMensagem(r: typeof t.mensagensSuporte.$inferSelect): MensagemSuporte {
  return { id: r.id, autor: r.autor, texto: r.texto, criadoEm: iso(r.criadoEm) };
}

async function mensagensDaConversa(conversaId: string): Promise<MensagemSuporte[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.mensagensSuporte)
    .where(eq(t.mensagensSuporte.conversaId, conversaId))
    .orderBy(asc(t.mensagensSuporte.criadoEm));
  return linhas.map(paraMensagem);
}

/** A conversa com as mensagens, ou `null` se a pessoa nunca escreveu. */
export async function conversaDoUsuario(
  dono: DonoDaConversa,
): Promise<{ conversa: ConversaSuporte; mensagens: MensagemSuporte[] } | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.conversasSuporte).where(doDono(dono));
  if (!linha) return null;
  return { conversa: paraConversa(linha), mensagens: await mensagensDaConversa(linha.id) };
}

/** Tem resposta da equipe que o usuário ainda não viu? (Bolinha no botão do chat.) */
export async function temRespostaNaoLida(dono: DonoDaConversa) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.conversasSuporte.id })
    .from(t.conversasSuporte)
    .where(and(doDono(dono), eq(t.conversasSuporte.naoLidaPeloUsuario, true)));
  return linha !== undefined;
}

/**
 * Grava a mensagem do usuário (criando a conversa na primeira) e acende o "não lida" da equipe.
 * `primeira` diz se a conversa acabou de ser aberta.
 */
export async function registrarMensagemDoUsuario(
  dono: DonoDaConversa,
  contato: { nome: string; email: string; tipo: TipoContatoSuporte },
  texto: string,
): Promise<{ conversa: ConversaSuporte; primeira: boolean }> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: t.conversasSuporte.id })
      .from(t.conversasSuporte)
      .where(doDono(dono));
    const [conversa] = await tx
      .insert(t.conversasSuporte)
      .values({ ...dono, ...contato, naoLidaPelaEquipe: true })
      .onConflictDoUpdate({
        target: "usuarioId" in dono ? t.conversasSuporte.usuarioId : t.conversasSuporte.visitanteId,
        set: { ...contato, naoLidaPelaEquipe: true, atualizadoEm: sql`now()` },
      })
      .returning();
    await tx
      .insert(t.mensagensSuporte)
      .values({ conversaId: conversa.id, autor: "usuario", texto });
    return { conversa: paraConversa(conversa), primeira: !existente };
  });
}

export async function marcarLidaPeloUsuario(dono: DonoDaConversa) {
  const banco = await obterBanco();
  await banco
    .update(t.conversasSuporte)
    .set({ naoLidaPeloUsuario: false })
    .where(and(doDono(dono), eq(t.conversasSuporte.naoLidaPeloUsuario, true)));
}

export type ConversaNaLista = ConversaSuporte & { ultima: MensagemSuporte | null };

/** Conversas para a gestão: as que esperam resposta primeiro, depois a mais recente. */
export async function listarConversasSuporte(): Promise<ConversaNaLista[]> {
  const banco = await obterBanco();
  const [conversas, ultimas] = await Promise.all([
    banco
      .select()
      .from(t.conversasSuporte)
      .orderBy(desc(t.conversasSuporte.naoLidaPelaEquipe), desc(t.conversasSuporte.atualizadoEm)),
    banco
      .selectDistinctOn([t.mensagensSuporte.conversaId])
      .from(t.mensagensSuporte)
      .orderBy(t.mensagensSuporte.conversaId, desc(t.mensagensSuporte.criadoEm)),
  ]);
  const porConversa = new Map(ultimas.map((m) => [m.conversaId, paraMensagem(m)]));
  return conversas.map((c) => ({ ...paraConversa(c), ultima: porConversa.get(c.id) ?? null }));
}

/** Conversa aberta pela gestão: devolve com as mensagens e apaga o "não lida" da equipe. */
export async function abrirConversaNaGestao(
  conversaId: string,
): Promise<{ conversa: ConversaSuporte; mensagens: MensagemSuporte[] } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.conversasSuporte)
    .set({ naoLidaPelaEquipe: false })
    .where(eq(t.conversasSuporte.id, conversaId))
    .returning();
  if (!linha) return null;
  return { conversa: paraConversa(linha), mensagens: await mensagensDaConversa(linha.id) };
}

/** Resposta da equipe: acende o "não lida" do usuário. Devolve a conversa, ou `null`. */
export async function registrarRespostaDaEquipe(
  conversaId: string,
  texto: string,
): Promise<ConversaSuporte | null> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const [conversa] = await tx
      .update(t.conversasSuporte)
      .set({ naoLidaPeloUsuario: true, naoLidaPelaEquipe: false, atualizadoEm: sql`now()` })
      .where(eq(t.conversasSuporte.id, conversaId))
      .returning();
    if (!conversa) return null;
    await tx.insert(t.mensagensSuporte).values({ conversaId, autor: "equipe", texto });
    return paraConversa(conversa);
  });
}

// ---------------------------------------------------------------- Sugestões

export type StatusSugestao = "nova" | "em_analise" | "feita" | "descartada";

export type Sugestao = {
  id: string;
  usuarioId: string | null;
  nome: string;
  email: string;
  texto: string;
  status: StatusSugestao;
  criadoEm: string;
};

function paraSugestao(r: typeof t.sugestoes.$inferSelect): Sugestao {
  return { ...r, criadoEm: iso(r.criadoEm) };
}

export async function criarSugestao(dados: {
  usuarioId: string;
  nome: string;
  email: string;
  texto: string;
}): Promise<Sugestao> {
  const banco = await obterBanco();
  const [linha] = await banco.insert(t.sugestoes).values(dados).returning();
  return paraSugestao(linha);
}

/** Sugestões para a gestão, da mais recente para a mais antiga. */
export async function listarSugestoes(): Promise<Sugestao[]> {
  const banco = await obterBanco();
  const linhas = await banco.select().from(t.sugestoes).orderBy(desc(t.sugestoes.criadoEm));
  return linhas.map(paraSugestao);
}

export async function mudarStatusSugestao(id: string, status: StatusSugestao) {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.sugestoes)
    .set({ status })
    .where(eq(t.sugestoes.id, id))
    .returning({ id: t.sugestoes.id });
  return linhas.length > 0;
}
