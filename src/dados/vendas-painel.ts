// Recursos de venda no painel do fotógrafo: desconto progressivo, pacote, cupons, preço
// individual e colaboradores. Como em ./painel.ts, toda função recebe o id do fotógrafo logado
// e só mexe no que é dele (um WHERE fotografo_id = …).

import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { eventosDosCupons } from "./comum";
import { deIso, iso, paraColaborador, paraCupom, paraFaixa, paraPacote } from "./mapas";
import type { Colaborador, Cupom, Evento, FaixaDesconto, Pacote } from "./tipos";

async function eventoDoDono(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return linha !== undefined;
}

// ---------------------------------------------------------------- Desconto progressivo

export type FaixaNova = Pick<FaixaDesconto, "quantidadeMin" | "descontoPct">;

const faixasDe = (fotografoId: string, eventoId: string | null) =>
  and(
    eq(t.faixasDesconto.fotografoId, fotografoId),
    eventoId === null ? isNull(t.faixasDesconto.eventoId) : eq(t.faixasDesconto.eventoId, eventoId),
  );

/**
 * Faixas do fotógrafo: as de um evento dele, ou a regra padrão (`eventoId` nulo). Em ordem de
 * quantidade.
 */
export async function listarFaixas(
  fotografoId: string,
  eventoId: string | null,
): Promise<FaixaDesconto[] | null> {
  if (eventoId && !(await eventoDoDono(eventoId, fotografoId))) return null;
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.faixasDesconto)
    .where(faixasDe(fotografoId, eventoId))
    .orderBy(asc(t.faixasDesconto.quantidadeMin));
  return linhas.map(paraFaixa);
}

/**
 * Troca todas as faixas (do evento ou a regra padrão) pelas novas, numa transação. Lista vazia
 * apaga: no evento, ele volta a usar a regra padrão.
 */
export async function salvarFaixas(
  fotografoId: string,
  eventoId: string | null,
  novas: FaixaNova[],
): Promise<boolean> {
  if (eventoId && !(await eventoDoDono(eventoId, fotografoId))) return false;
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx.delete(t.faixasDesconto).where(faixasDe(fotografoId, eventoId));
    if (novas.length > 0) {
      await tx.insert(t.faixasDesconto).values(novas.map((f) => ({ fotografoId, eventoId, ...f })));
    }
  });
  return true;
}

/** Liga ou desliga o desconto progressivo num evento do fotógrafo. Devolve se o evento é dele. */
export async function definirDescontoProgressivo(
  eventoId: string,
  fotografoId: string,
  ligado: boolean,
): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.eventos)
    .set({ descontoProgressivo: ligado })
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)))
    .returning({ id: t.eventos.id });
  return atualizados.length > 0;
}

// ---------------------------------------------------------------- Pacote

export type DadosPacote = Omit<Pacote, "id" | "eventoId">;

export async function buscarPacoteDoEvento(
  eventoId: string,
  fotografoId: string,
): Promise<Pacote | null> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return null;
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.pacotes).where(eq(t.pacotes.eventoId, eventoId));
  return linha ? paraPacote(linha) : null;
}

/** Cria ou atualiza o pacote do evento (um por evento). */
export async function salvarPacote(
  eventoId: string,
  fotografoId: string,
  dados: DadosPacote,
): Promise<boolean> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return false;
  const banco = await obterBanco();
  const valores = { ...dados, expiraEm: deIso(dados.expiraEm) };
  await banco
    .insert(t.pacotes)
    .values({ eventoId, ...valores })
    .onConflictDoUpdate({ target: t.pacotes.eventoId, set: valores });
  return true;
}

// ---------------------------------------------------------------- Cupons

export type DadosCupom = Omit<Cupom, "id" | "fotografoId" | "usos">;

export async function listarCuponsDoFotografo(fotografoId: string): Promise<Cupom[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.cupons)
    .where(eq(t.cupons.fotografoId, fotografoId))
    .orderBy(asc(t.cupons.codigo));
  const eventos = await eventosDosCupons(linhas.map((c) => c.id));
  return linhas.map((c) => paraCupom(c, eventos.get(c.id) ?? []));
}

/**
 * O código já é de outro cupom? Códigos são únicos na plataforma inteira: o comprador digita
 * só o código, sem dizer de qual fotógrafo é.
 */
export async function codigoDeCupomEmUso(codigo: string, excetoId?: string) {
  const banco = await obterBanco();
  const mesmoCodigo = eq(sql`upper(${t.cupons.codigo})`, codigo.toUpperCase());
  const [linha] = await banco
    .select({ id: t.cupons.id })
    .from(t.cupons)
    .where(excetoId ? and(mesmoCodigo, ne(t.cupons.id, excetoId)) : mesmoCodigo);
  return linha !== undefined;
}

/** Eventos do fotógrafo entre os informados (para conferir os eventos de um cupom). */
export async function filtrarEventosDoFotografo(fotografoId: string, eventoIds: string[]) {
  if (eventoIds.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.fotografoId, fotografoId), inArray(t.eventos.id, eventoIds)));
  return linhas.map((l) => l.id);
}

/** Cria (sem `cupomId`) ou atualiza um cupom do fotógrafo. Os usos já feitos não mudam. */
export async function salvarCupom(
  fotografoId: string,
  dados: DadosCupom,
  cupomId?: string,
): Promise<boolean> {
  const banco = await obterBanco();
  const { eventoIds, ...resto } = dados;
  const valores = { ...resto, inicioEm: deIso(resto.inicioEm), expiraEm: deIso(resto.expiraEm) };
  return banco.transaction(async (tx) => {
    let id: string;
    if (!cupomId) {
      const [linha] = await tx
        .insert(t.cupons)
        .values({ ...valores, fotografoId })
        .returning({ id: t.cupons.id });
      id = linha.id;
    } else {
      const [linha] = await tx
        .update(t.cupons)
        .set(valores)
        .where(and(eq(t.cupons.id, cupomId), eq(t.cupons.fotografoId, fotografoId)))
        .returning({ id: t.cupons.id });
      if (!linha) return false;
      id = linha.id;
      await tx.delete(t.cuponsEventos).where(eq(t.cuponsEventos.cupomId, id));
    }
    if (eventoIds.length > 0) {
      await tx
        .insert(t.cuponsEventos)
        .values(eventoIds.map((eventoId) => ({ cupomId: id, eventoId })));
    }
    return true;
  });
}

// ---------------------------------------------------------------- Preço individual

/**
 * Preço próprio de um item do evento do fotógrafo; `null` volta ao preço do evento. Vale para
 * as próximas vendas: o pedido guarda o preço do momento da compra.
 */
export async function definirPrecoDoItem(
  fotoId: string,
  fotografoId: string,
  precoCentavos: number | null,
): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.fotos)
    .set({ precoCentavos })
    .where(
      and(
        eq(t.fotos.id, fotoId),
        isNull(t.fotos.excluidaEm),
        inArray(
          t.fotos.eventoId,
          banco
            .select({ id: t.eventos.id })
            .from(t.eventos)
            .where(eq(t.eventos.fotografoId, fotografoId)),
        ),
      ),
    )
    .returning({ id: t.fotos.id });
  return atualizados.length > 0;
}

// ---------------------------------------------------------------- Colaboradores

export type ColaboradorDoPainel = Colaborador & { nomePublico: string; totalItens: number };

async function itensDoColaborador(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [{ total }] = await banco
    .select({ total: sql<number>`count(*)::int` })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        eq(t.fotos.enviadaPor, fotografoId),
        isNull(t.fotos.excluidaEm),
      ),
    );
  return total;
}

export async function listarColaboradores(
  eventoId: string,
  fotografoId: string,
): Promise<ColaboradorDoPainel[] | null> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return null;
  const banco = await obterBanco();
  const linhas = await banco
    .select({ colaborador: t.colaboradores, nome: t.fotografos.nomePublico })
    .from(t.colaboradores)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.colaboradores.fotografoId))
    .where(eq(t.colaboradores.eventoId, eventoId));
  return Promise.all(
    linhas.map(async (l) => ({
      ...paraColaborador(l.colaborador),
      nomePublico: l.nome,
      totalItens: await itensDoColaborador(eventoId, l.colaborador.fotografoId),
    })),
  );
}

/**
 * Fotógrafo pelo e-mail da conta, para convidar como colaborador. Só devolve o perfil público
 * (nome e id), nunca dados da conta.
 */
export async function buscarFotografoPorEmail(
  email: string,
): Promise<{ id: string; nomePublico: string } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.fotografos.id, nomePublico: t.fotografos.nomePublico })
    .from(t.fotografos)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId))
    .where(eq(t.usuarios.email, email.trim().toLowerCase()));
  return linha ?? null;
}

export type ResultadoColaborador = "ok" | "evento" | "ja_colabora" | "dono";

export async function adicionarColaborador(
  eventoId: string,
  donoId: string,
  dados: { fotografoId: string; comissaoDonoPct: number; nota: string | null },
): Promise<ResultadoColaborador> {
  if (!(await eventoDoDono(eventoId, donoId))) return "evento";
  if (dados.fotografoId === donoId) return "dono";
  const banco = await obterBanco();
  const inseridos = await banco
    .insert(t.colaboradores)
    .values({ eventoId, ...dados })
    .onConflictDoNothing()
    .returning({ id: t.colaboradores.id });
  return inseridos.length > 0 ? "ok" : "ja_colabora";
}

async function colaboradorDoDono(colaboradorId: string, donoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ colaborador: t.colaboradores })
    .from(t.colaboradores)
    .innerJoin(t.eventos, eq(t.eventos.id, t.colaboradores.eventoId))
    .where(and(eq(t.colaboradores.id, colaboradorId), eq(t.eventos.fotografoId, donoId)));
  return linha?.colaborador ?? null;
}

/**
 * Muda comissão e nota. A comissão só muda enquanto o convite está pendente: depois do aceite,
 * ela é a condição combinada e vale para todas as fotos dele no evento (sem mudança que o
 * colaborador não aceitou). A nota, só o dono vê, muda sempre.
 */
export async function atualizarColaborador(
  colaboradorId: string,
  donoId: string,
  dados: { comissaoDonoPct: number; nota: string | null },
): Promise<"ok" | "nao_encontrado" | "comissao_aceita"> {
  const atual = await colaboradorDoDono(colaboradorId, donoId);
  if (!atual) return "nao_encontrado";
  if (atual.aceitoEm && atual.comissaoDonoPct !== dados.comissaoDonoPct) {
    return "comissao_aceita";
  }
  const banco = await obterBanco();
  await banco.update(t.colaboradores).set(dados).where(eq(t.colaboradores.id, colaboradorId));
  return "ok";
}

/**
 * O convidado aceita (ou recusa) o convite. Aceitar grava a hora; recusar apaga o convite, só
 * enquanto ele está pendente e sem fotos. Só o próprio convidado responde.
 */
export async function responderConvite(
  colaboradorId: string,
  fotografoId: string,
  aceitar: boolean,
): Promise<boolean> {
  const banco = await obterBanco();
  const doConvidado = and(
    eq(t.colaboradores.id, colaboradorId),
    eq(t.colaboradores.fotografoId, fotografoId),
  );
  if (aceitar) {
    const atualizados = await banco
      .update(t.colaboradores)
      .set({ aceitoEm: new Date() })
      .where(and(doConvidado, isNull(t.colaboradores.aceitoEm)))
      .returning({ id: t.colaboradores.id });
    return atualizados.length > 0;
  }
  const [convite] = await banco.select().from(t.colaboradores).where(doConvidado);
  if (!convite || convite.aceitoEm) return false;
  if ((await itensDoColaborador(convite.eventoId, fotografoId)) > 0) return false;
  await banco.delete(t.colaboradores).where(doConvidado);
  return true;
}

/**
 * Remove o colaborador, só se ele não tiver fotos no evento: a comissão do dono sobre as
 * fotos dele depende desse vínculo. Para remover, o dono exclui as fotos antes.
 */
export async function removerColaborador(
  colaboradorId: string,
  donoId: string,
): Promise<"ok" | "nao_encontrado" | "tem_fotos"> {
  const colaborador = await colaboradorDoDono(colaboradorId, donoId);
  if (!colaborador) return "nao_encontrado";
  if ((await itensDoColaborador(colaborador.eventoId, colaborador.fotografoId)) > 0) {
    return "tem_fotos";
  }
  const banco = await obterBanco();
  await banco.delete(t.colaboradores).where(eq(t.colaboradores.id, colaboradorId));
  return "ok";
}

export type ColaboracaoDoPainel = {
  colaboradorId: string;
  /** `null`: convite ainda não aceito (ou comissão mudou e precisa de novo aceite). */
  aceitoEm: string | null;
  evento: Pick<
    Evento,
    "id" | "titulo" | "slug" | "inicioEm" | "fimEm" | "status" | "liberacao" | "liberadoEm"
  >;
  donoNome: string;
  comissaoDonoPct: number;
  nota: string | null;
  meusItens: number;
};

/** Eventos de outros fotógrafos em que este fotógrafo colabora. */
export async function listarColaboracoes(fotografoId: string): Promise<ColaboracaoDoPainel[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      colaborador: t.colaboradores,
      evento: t.eventos,
      donoNome: t.fotografos.nomePublico,
    })
    .from(t.colaboradores)
    .innerJoin(t.eventos, eq(t.eventos.id, t.colaboradores.eventoId))
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.eventos.fotografoId))
    .where(eq(t.colaboradores.fotografoId, fotografoId));
  const resultado = await Promise.all(
    linhas.map(async (l) => ({
      colaboradorId: l.colaborador.id,
      aceitoEm: iso(l.colaborador.aceitoEm),
      evento: {
        id: l.evento.id,
        titulo: l.evento.titulo,
        slug: l.evento.slug,
        inicioEm: iso(l.evento.inicioEm),
        fimEm: iso(l.evento.fimEm),
        status: l.evento.status,
        liberacao: l.evento.liberacao,
        liberadoEm: iso(l.evento.liberadoEm),
      },
      donoNome: l.donoNome,
      comissaoDonoPct: l.colaborador.comissaoDonoPct,
      nota: l.colaborador.nota,
      meusItens: await itensDoColaborador(l.evento.id, fotografoId),
    })),
  );
  return resultado.sort((a, b) => b.evento.inicioEm.localeCompare(a.evento.inicioEm));
}

/** O fotógrafo pode enviar fotos a este evento: é o dono ou colaborador. */
export async function podeEnviarAoEvento(eventoId: string, fotografoId: string) {
  if (await eventoDoDono(eventoId, fotografoId)) return true;
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.colaboradores.id })
    .from(t.colaboradores)
    .where(
      and(
        eq(t.colaboradores.eventoId, eventoId),
        eq(t.colaboradores.fotografoId, fotografoId),
        // Só depois de aceitar o convite (e as condições).
        isNotNull(t.colaboradores.aceitoEm),
      ),
    );
  return linha !== undefined;
}
