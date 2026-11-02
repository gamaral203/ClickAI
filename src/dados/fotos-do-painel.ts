// Grade de fotos do painel do evento, paginada no servidor (docs/arquitetura.md, "Pastas e
// subpastas"). Com milhares de fotos, a página não pode levar a lista inteira ao navegador a cada
// atualização: filtros e contagens são calculados aqui, com as mesmas regras de
// src/lib/filtro-painel.ts, e a tela pede só as fotos que vai mostrar.

import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  DIA_TODOS,
  LIBERACAO_TODAS,
  PASTA_TODAS,
  SEM_DATA,
  SITUACAO_TODAS,
  type FiltroDoPainel,
} from "@/lib/filtro-painel";
import { estadoDaLiberacao, type EstadoLiberacao } from "@/lib/liberacao";

import { paraFoto } from "./mapas";
import { condicoesDoFiltro } from "./pastas";

export type ContagemDasSituacoes = { pronta: number; processando: number; erro: number };

/** Só as contagens por situação do evento inteiro: a consulta leve que a tela repete. */
export async function situacaoDasFotosDoEvento(eventoId: string): Promise<ContagemDasSituacoes> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      pronta: sql<number>`(count(*) filter (where ${t.fotos.status} = 'pronta'))::int`,
      processando: sql<number>`(count(*) filter (where ${t.fotos.status} = 'processando'))::int`,
      erro: sql<number>`(count(*) filter (where ${t.fotos.status} = 'erro'))::int`,
    })
    .from(t.fotos)
    .where(and(eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm)));
  return linha;
}

/** Se alguma foto do evento tem data de captura: define a data padrão do filtro por dia. */
export async function eventoTemDataDeCaptura(eventoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotos.id })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        isNull(t.fotos.excluidaEm),
        isNotNull(t.fotos.capturadaEm),
      ),
    )
    .limit(1);
  return linhas.length > 0;
}

export type ContagensDoPainel = {
  /** Fotos que o filtro atual mostra. */
  total: number;
  /** Do evento inteiro, sem filtro nenhum. */
  evento: ContagemDasSituacoes;
  /** Cada grupo conta as opções dele com os outros filtros aplicados. */
  situacao: ContagemDasSituacoes & { todas: number };
  liberacao: Record<"todas" | EstadoLiberacao, number>;
  pastas: { todas: number; sem: number; porPasta: Record<string, number> };
  dias: { dia: string; total: number }[];
  /** Ainda não liberadas no evento inteiro (o alvo da liberação sem seleção). */
  naoLiberadas: number;
  agendadas: number;
  /** Próxima liberação agendada: a tela se atualiza nesse minuto. */
  proximaLiberacao: string | null;
};

/** Sem pasta válida (a pasta do filtro foi excluída), vale "Todas as pastas". */
async function condicoes(eventoId: string, filtro: FiltroDoPainel, agora: number): Promise<SQL[]> {
  const banco = await obterBanco();
  const certas = await condicoesDoFiltro(banco, eventoId, filtro, agora);
  if (certas) return certas;
  const semPasta = await condicoesDoFiltro(
    banco,
    eventoId,
    { ...filtro, pasta: PASTA_TODAS, dia: DIA_TODOS },
    agora,
  );
  return semPasta ?? [eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm)];
}

export async function contagensDoPainel(
  eventoId: string,
  filtro: FiltroDoPainel,
  agora: number,
): Promise<ContagensDoPainel> {
  const banco = await obterBanco();
  // Valor escrito na consulta, sem parâmetro: o mesmo CASE entra no SELECT e no GROUP BY, e dois
  // parâmetros não contariam como a mesma expressão. Sai de um Date: não há texto de fora aqui.
  const momento = sql.raw(`'${new Date(agora).toISOString()}'::timestamptz`);
  const estado = sql`case
    when ${t.fotos.liberarEm} is null then 'manual'
    when ${t.fotos.liberarEm} > ${momento} then 'agendada'
    else 'liberada' end`;
  const coluna = filtro.base === "envio" ? t.fotos.criadoEm : t.fotos.capturadaEm;
  // Dia de Brasília (UTC-3, como diaEmBrasilia em src/lib/filtro-painel.ts).
  const dia = sql<
    string | null
  >`to_char((${coluna} at time zone 'UTC') - interval '3 hours', 'YYYY-MM-DD')`;

  const [evento, total, porSituacao, porLiberacao, porPasta, porDia, arvore, [global]] =
    await Promise.all([
      situacaoDasFotosDoEvento(eventoId),
      banco
        .select({ n: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(and(...(await condicoes(eventoId, filtro, agora)))),
      banco
        .select({ chave: t.fotos.status, n: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(and(...(await condicoes(eventoId, { ...filtro, situacao: SITUACAO_TODAS }, agora))))
        .groupBy(t.fotos.status),
      banco
        .select({ chave: sql<string>`${estado}`, n: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(
          and(...(await condicoes(eventoId, { ...filtro, liberacao: LIBERACAO_TODAS }, agora))),
        )
        .groupBy(estado),
      banco
        .select({ chave: t.fotos.pastaId, n: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(and(...(await condicoes(eventoId, { ...filtro, pasta: PASTA_TODAS }, agora))))
        .groupBy(t.fotos.pastaId),
      banco
        .select({ chave: dia, n: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(and(...(await condicoes(eventoId, { ...filtro, dia: DIA_TODOS }, agora))))
        .groupBy(dia),
      banco
        .select({ id: t.pastas.id, pastaPaiId: t.pastas.pastaPaiId })
        .from(t.pastas)
        .where(eq(t.pastas.eventoId, eventoId)),
      banco
        .select({
          naoLiberadas: sql<number>`(count(*) filter (where ${estado} <> 'liberada'))::int`,
          agendadas: sql<number>`(count(*) filter (where ${estado} = 'agendada'))::int`,
          proxima: sql<
            string | null
          >`min(${t.fotos.liberarEm}) filter (where ${estado} = 'agendada')`,
        })
        .from(t.fotos)
        .where(and(eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm))),
    ]);

  const situacao = { todas: 0, pronta: 0, processando: 0, erro: 0 };
  for (const l of porSituacao) {
    situacao[l.chave] = l.n;
    situacao.todas += l.n;
  }
  const liberacao = { todas: 0, liberada: 0, agendada: 0, manual: 0 };
  for (const l of porLiberacao) {
    liberacao[l.chave as EstadoLiberacao] = l.n;
    liberacao.todas += l.n;
  }
  const diretas = new Map(porPasta.map((l) => [l.chave, l.n]));
  const porId: Record<string, number> = {};
  for (const p of arvore) {
    // A pasta de nível 1 conta também as subpastas.
    porId[p.id] =
      (diretas.get(p.id) ?? 0) +
      (p.pastaPaiId === null
        ? arvore
            .filter((f) => f.pastaPaiId === p.id)
            .reduce((s, f) => s + (diretas.get(f.id) ?? 0), 0)
        : 0);
  }
  const dias = porDia
    .filter((l) => l.chave !== null)
    .map((l) => ({ dia: l.chave as string, total: l.n }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
  const semData = porDia.find((l) => l.chave === null);
  if (semData) dias.push({ dia: SEM_DATA, total: semData.n });

  return {
    total: total[0]?.n ?? 0,
    evento,
    situacao,
    liberacao,
    pastas: {
      todas: porPasta.reduce((s, l) => s + l.n, 0),
      sem: diretas.get(null) ?? 0,
      porPasta: porId,
    },
    dias,
    naoLiberadas: global?.naoLiberadas ?? 0,
    agendadas: global?.agendadas ?? 0,
    proximaLiberacao: global?.proxima ? new Date(global.proxima).toISOString() : null,
  };
}

/** Uma página da grade, sem as chaves internas: só prévias protegidas (src/dados/mapas.ts). */
export async function paginaDoPainel(
  eventoId: string,
  filtro: FiltroDoPainel,
  agora: number,
  desde: number,
  limite: number,
) {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.fotos)
    .where(and(...(await condicoes(eventoId, filtro, agora))))
    .orderBy(asc(t.fotos.ordem), asc(t.fotos.id))
    .offset(desde)
    .limit(limite);
  const ids = linhas.map((l) => l.id);
  const vendidos =
    ids.length === 0
      ? []
      : await banco
          .selectDistinct({ fotoId: t.itensPedido.fotoId })
          .from(t.itensPedido)
          .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
          .where(and(inArray(t.itensPedido.fotoId, ids), eq(t.pedidos.status, "pago")));
  const vendido = new Set(vendidos.map((v) => v.fotoId));
  return linhas.map((f) => ({
    ...paraFoto(f),
    vendido: vendido.has(f.id),
    erroMensagem: f.status === "erro" ? f.erroMensagem : null,
  }));
}

/**
 * Ids e liberação de todas as fotos do filtro, sem o resto das colunas: quem desmarca uma foto em
 * "todas deste filtro" volta para a seleção por id, com as outras ainda marcadas.
 */
export async function idsDoFiltroDoPainel(eventoId: string, filtro: FiltroDoPainel, agora: number) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotos.id, liberarEm: t.fotos.liberarEm })
    .from(t.fotos)
    .where(and(...(await condicoes(eventoId, filtro, agora))))
    .orderBy(asc(t.fotos.ordem), asc(t.fotos.id))
    .limit(20_000);
  return linhas.map((l) => ({
    id: l.id,
    estadoLiberacao: estadoDaLiberacao(l.liberarEm?.toISOString() ?? null, agora),
  }));
}

/** Números de peito só das fotos desta página. */
export async function numerosDasFotos(fotoIds: string[]): Promise<Map<string, string[]>> {
  const porFoto = new Map<string, string[]>();
  if (fotoIds.length === 0) return porFoto;
  const banco = await obterBanco();
  const linhas = await banco
    .select({ fotoId: t.numeros.fotoId, numero: t.numeros.numero })
    .from(t.numeros)
    .where(inArray(t.numeros.fotoId, fotoIds))
    .orderBy(asc(t.numeros.numero));
  for (const l of linhas) {
    const lista = porFoto.get(l.fotoId);
    if (lista) lista.push(l.numero);
    else porFoto.set(l.fotoId, [l.numero]);
  }
  return porFoto;
}

/** Fotos que o seletor de capa mostra: as primeiras prontas (cada uma pode virar capa pela grade). */
export async function fotosParaEscolherCapa(eventoId: string, limite: number) {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        isNull(t.fotos.excluidaEm),
        eq(t.fotos.status, "pronta"),
        eq(t.fotos.tipo, "foto"),
      ),
    )
    .orderBy(asc(t.fotos.ordem), asc(t.fotos.id))
    .limit(limite);
  return linhas.map(paraFoto);
}
