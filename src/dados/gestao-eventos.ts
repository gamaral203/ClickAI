// Eventos e fotos para a gestão (/admin/eventos): todos os eventos de todos os fotógrafos, em
// qualquer status, e todas as fotos e vídeos prontos de um evento, de qualquer autor. Só a equipe
// chama estas funções: o papel de gestor é conferido em cada página, ação e rota
// (`exigirGestor` nas páginas; src/servicos/originais-da-gestao.ts nos downloads). Aqui nada é
// filtrado por dono, porque a gestão vê tudo; os ids chegam já validados como UUID.
//
// As imagens são sempre as prévias protegidas (com a marca d'água, `urlDaPrevia`); o original só
// sai pelo download da gestão, com as proteções do serviço.

import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { arvoreDePastas, idsDaPastaComSubpastas, type PastaNaArvore } from "@/lib/pastas";
import { urlDaPrevia } from "@/lib/url-publica";

import { capasParaODono, type CapaDoEvento } from "./capa";
import { pastasDoEvento } from "./pastas";
import type { StatusEvento } from "./tipos";

export const STATUS_DE_EVENTO = t.statusEvento.enumValues;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Escapa os curingas do LIKE: o texto digitado é procurado como está. */
function semCuringas(texto: string) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------- Lista de eventos

export type FiltroEventosDaGestao = {
  /** Parte do nome, do endereço (slug), da cidade ou do nome do fotógrafo. */
  busca?: string | null;
  status?: StatusEvento | null;
  /** Data do evento (início), de e até, em dias AAAA-MM-DD no horário de Brasília. */
  de?: string | null;
  ate?: string | null;
};

export type EventoDaGestao = {
  id: string;
  slug: string;
  titulo: string;
  inicioEm: string;
  cidade: string;
  estado: string;
  status: StatusEvento;
  fotografoId: string;
  fotografoNome: string;
  fotografoSlug: string;
  /** Fotos e vídeos prontos e não excluídos. */
  totalFotos: number;
  /** Fotos e vídeos diferentes em pelo menos um pedido pago. */
  totalVendidas: number;
  capa: CapaDoEvento | null;
};

function condicoesDosEventos(filtro: FiltroEventosDaGestao): SQL | undefined {
  const partes: (SQL | undefined)[] = [];
  if (filtro.status) partes.push(eq(t.eventos.status, filtro.status));
  if (filtro.de && DIA.test(filtro.de)) {
    partes.push(sql`${t.eventos.inicioEm} >= ${`${filtro.de}T00:00:00-03:00`}::timestamptz`);
  }
  if (filtro.ate && DIA.test(filtro.ate)) {
    partes.push(
      sql`${t.eventos.inicioEm} < (${`${filtro.ate}T00:00:00-03:00`}::timestamptz + interval '1 day')`,
    );
  }
  const termo = filtro.busca?.trim().slice(0, 120);
  if (termo) {
    const padrao = `%${semCuringas(termo)}%`;
    partes.push(
      or(
        ilike(t.eventos.titulo, padrao),
        ilike(t.eventos.slug, padrao),
        ilike(t.eventos.cidade, padrao),
        ilike(t.fotografos.nomePublico, padrao),
      ),
    );
  }
  return partes.length ? and(...partes) : undefined;
}

const totalFotos = sql<number>`(select count(*) from ${t.fotos} where ${t.fotos.eventoId} = ${t.eventos.id} and ${t.fotos.status} = 'pronta' and ${t.fotos.excluidaEm} is null)::int`;
const totalVendidas = sql<number>`(select count(distinct ${t.itensPedido.fotoId}) from ${t.itensPedido} inner join ${t.pedidos} on ${t.pedidos.id} = ${t.itensPedido.pedidoId} inner join ${t.fotos} on ${t.fotos.id} = ${t.itensPedido.fotoId} where ${t.fotos.eventoId} = ${t.eventos.id} and ${t.pedidos.status} = 'pago')::int`;

/**
 * Uma página dos eventos de todos os fotógrafos, em qualquer status, do mais recente (data do
 * evento) para o mais antigo, com o total para a paginação.
 */
export async function listarEventosDaGestao(
  filtro: FiltroEventosDaGestao,
  pagina: number,
  porPagina: number,
): Promise<{ eventos: EventoDaGestao[]; total: number }> {
  const banco = await obterBanco();
  const onde = condicoesDosEventos(filtro);
  const [linhas, [contagem]] = await Promise.all([
    banco
      .select({
        id: t.eventos.id,
        slug: t.eventos.slug,
        titulo: t.eventos.titulo,
        inicioEm: t.eventos.inicioEm,
        cidade: t.eventos.cidade,
        estado: t.eventos.estado,
        status: t.eventos.status,
        fotografoId: t.fotografos.id,
        fotografoNome: t.fotografos.nomePublico,
        fotografoSlug: t.fotografos.slug,
        totalFotos,
        totalVendidas,
      })
      .from(t.eventos)
      .innerJoin(t.fotografos, eq(t.fotografos.id, t.eventos.fotografoId))
      .where(onde)
      .orderBy(desc(t.eventos.inicioEm), asc(t.eventos.id))
      .limit(porPagina)
      .offset((Math.max(1, pagina) - 1) * porPagina),
    banco
      .select({ total: sql<number>`count(*)::int` })
      .from(t.eventos)
      .innerJoin(t.fotografos, eq(t.fotografos.id, t.eventos.fotografoId))
      .where(onde),
  ]);
  const capas = await capasParaODono(linhas.map((l) => l.id));
  return {
    total: Number(contagem?.total ?? 0),
    eventos: linhas.map((l) => ({
      ...l,
      inicioEm: l.inicioEm.toISOString(),
      totalFotos: Number(l.totalFotos),
      totalVendidas: Number(l.totalVendidas),
      capa: capas.get(l.id) ?? null,
    })),
  };
}

// ---------------------------------------------------------------- Detalhe do evento

export type AutorDoEvento = { id: string; nome: string; dono: boolean };

export type DetalheDoEventoDaGestao = Omit<EventoDaGestao, "capa"> & {
  local: string;
  visibilidade: (typeof t.visibilidade.enumValues)[number];
  /** Itens prontos excluídos (só aparecem com "mostrar excluídas"). */
  totalExcluidas: number;
  autores: AutorDoEvento[];
  pastas: PastaNaArvore<{ id: string; nome: string; pastaPaiId: string | null; ordem: number }>[];
};

/** O evento (de qualquer fotógrafo, em qualquer status), com autores e pastas; ou `null`. */
export async function eventoDaGestao(eventoId: string): Promise<DetalheDoEventoDaGestao | null> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({
      id: t.eventos.id,
      slug: t.eventos.slug,
      titulo: t.eventos.titulo,
      inicioEm: t.eventos.inicioEm,
      local: t.eventos.local,
      cidade: t.eventos.cidade,
      estado: t.eventos.estado,
      status: t.eventos.status,
      visibilidade: t.eventos.visibilidade,
      fotografoId: t.fotografos.id,
      fotografoNome: t.fotografos.nomePublico,
      fotografoSlug: t.fotografos.slug,
      totalFotos,
      totalVendidas,
      totalExcluidas: sql<number>`(select count(*) from ${t.fotos} where ${t.fotos.eventoId} = ${t.eventos.id} and ${t.fotos.status} = 'pronta' and ${t.fotos.excluidaEm} is not null)::int`,
    })
    .from(t.eventos)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.eventos.fotografoId))
    .where(eq(t.eventos.id, eventoId));
  if (!evento) return null;
  const [autores, pastas] = await Promise.all([
    autoresDoEvento(eventoId, evento.fotografoId),
    pastasDoEvento(eventoId),
  ]);
  return {
    ...evento,
    inicioEm: evento.inicioEm.toISOString(),
    totalFotos: Number(evento.totalFotos),
    totalVendidas: Number(evento.totalVendidas),
    totalExcluidas: Number(evento.totalExcluidas),
    autores,
    pastas: arvoreDePastas(pastas),
  };
}

/** Dono, colaboradores com o convite aceito e quem enviou alguma foto ao evento. */
async function autoresDoEvento(eventoId: string, donoId: string): Promise<AutorDoEvento[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotografos.id, nome: t.fotografos.nomePublico })
    .from(t.fotografos)
    .where(
      or(
        eq(t.fotografos.id, donoId),
        inArray(
          t.fotografos.id,
          banco
            .select({ id: t.colaboradores.fotografoId })
            .from(t.colaboradores)
            .where(
              and(eq(t.colaboradores.eventoId, eventoId), isNotNull(t.colaboradores.aceitoEm)),
            ),
        ),
        inArray(
          t.fotografos.id,
          banco
            .selectDistinct({ id: t.fotos.enviadaPor })
            .from(t.fotos)
            .where(eq(t.fotos.eventoId, eventoId)),
        ),
      ),
    );
  return linhas
    .map((l) => ({ ...l, dono: l.id === donoId }))
    .sort((a, b) => Number(b.dono) - Number(a.dono) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------------------------------------------------------------- Fotos do evento

export type FiltroFotosDaGestao = {
  /** Uma pasta (com as subpastas dela) ou "sem" (itens fora de qualquer pasta). */
  pastaId?: string | null;
  /** Conta de fotógrafo que enviou (dono ou colaborador). */
  autorId?: string | null;
  /** Inclui os itens excluídos (logicamente) pelo dono. */
  excluidas?: boolean;
};

export type FotoDaGestao = {
  id: string;
  tipo: "foto" | "video";
  nomeArquivo: string;
  /** Miniatura protegida (com a marca d'água), ou o aviso "Processando". */
  urlMiniatura: string;
  pastaId: string | null;
  autorId: string;
  autorNome: string;
  excluida: boolean;
  tamanhoBytes: number | null;
};

export type OriginalDaGestao = {
  id: string;
  eventoId: string;
  eventoSlug: string;
  chave: string;
  nomeArquivo: string;
  tamanhoBytes: number | null;
  pastaId: string | null;
  excluida: boolean;
};

/**
 * Condições sobre as fotos do evento: prontas, com original, e o filtro da tela (pasta com as
 * subpastas, autor, excluídas só quando pedidas).
 */
async function condicoesDasFotos(eventoId: string, filtro: FiltroFotosDaGestao): Promise<SQL> {
  const partes: (SQL | undefined)[] = [
    eq(t.fotos.eventoId, eventoId),
    eq(t.fotos.status, "pronta"),
    isNotNull(t.fotos.chaveOriginal),
  ];
  if (!filtro.excluidas) partes.push(isNull(t.fotos.excluidaEm));
  if (filtro.autorId) partes.push(eq(t.fotos.enviadaPor, filtro.autorId));
  if (filtro.pastaId === "sem") {
    partes.push(isNull(t.fotos.pastaId));
  } else if (filtro.pastaId) {
    const pastas = await pastasDoEvento(eventoId);
    // Pasta de outro evento (ou inexistente): nenhuma foto, em vez de ignorar o filtro.
    if (!pastas.some((p) => p.id === filtro.pastaId)) return sql`false`;
    partes.push(inArray(t.fotos.pastaId, [...idsDaPastaComSubpastas(filtro.pastaId, pastas)]));
  }
  return and(...partes)!;
}

/** Uma página das fotos do evento (ordem do evento), com o total e o tamanho do filtro. */
export async function listarFotosDaGestao(
  eventoId: string,
  filtro: FiltroFotosDaGestao,
  pagina: number,
  porPagina: number,
): Promise<{ fotos: FotoDaGestao[]; total: number; bytes: number }> {
  const banco = await obterBanco();
  const onde = await condicoesDasFotos(eventoId, filtro);
  const [linhas, [resumo]] = await Promise.all([
    banco
      .select({
        id: t.fotos.id,
        tipo: t.fotos.tipo,
        nomeArquivo: t.fotos.nomeArquivo,
        urlMiniatura: t.fotos.urlMiniatura,
        pastaId: t.fotos.pastaId,
        autorId: t.fotos.enviadaPor,
        autorNome: t.fotografos.nomePublico,
        excluidaEm: t.fotos.excluidaEm,
        tamanhoBytes: t.fotos.tamanhoBytes,
      })
      .from(t.fotos)
      .innerJoin(t.fotografos, eq(t.fotografos.id, t.fotos.enviadaPor))
      .where(onde)
      .orderBy(asc(t.fotos.ordem), asc(t.fotos.id))
      .limit(porPagina)
      .offset((Math.max(1, pagina) - 1) * porPagina),
    banco
      .select({
        total: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}), 0)::bigint`,
      })
      .from(t.fotos)
      .where(onde),
  ]);
  return {
    total: Number(resumo?.total ?? 0),
    bytes: Number(resumo?.bytes ?? 0),
    fotos: linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      nomeArquivo: l.nomeArquivo,
      urlMiniatura: urlDaPrevia(l.urlMiniatura),
      pastaId: l.pastaId,
      autorId: l.autorId,
      autorNome: l.autorNome,
      excluida: l.excluidaEm !== null,
      tamanhoBytes: l.tamanhoBytes,
    })),
  };
}

const colunasDoOriginal = {
  id: t.fotos.id,
  eventoId: t.fotos.eventoId,
  eventoSlug: t.eventos.slug,
  chave: t.fotos.chaveOriginal,
  nomeArquivo: t.fotos.nomeArquivo,
  tamanhoBytes: t.fotos.tamanhoBytes,
  pastaId: t.fotos.pastaId,
  excluidaEm: t.fotos.excluidaEm,
};

function paraOriginal(l: {
  id: string;
  eventoId: string;
  eventoSlug: string;
  chave: string | null;
  nomeArquivo: string;
  tamanhoBytes: number | null;
  pastaId: string | null;
  excluidaEm: Date | null;
}): OriginalDaGestao {
  return {
    id: l.id,
    eventoId: l.eventoId,
    eventoSlug: l.eventoSlug,
    chave: l.chave!,
    nomeArquivo: l.nomeArquivo,
    tamanhoBytes: l.tamanhoBytes,
    pastaId: l.pastaId,
    excluida: l.excluidaEm !== null,
  };
}

/**
 * Um lote de originais do evento para a gestão, em ordem de id (estável entre lotes): os que vêm
 * depois de `depois`, ou só os `ids` pedidos. Ids de outro evento ou fora do filtro não voltam.
 */
export async function loteOriginaisDaGestao(opcoes: {
  eventoId: string;
  filtro: FiltroFotosDaGestao;
  limite: number;
  depois?: string | null;
  ids?: string[];
}): Promise<OriginalDaGestao[]> {
  const { eventoId, filtro, limite, depois, ids } = opcoes;
  if (ids && ids.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select(colunasDoOriginal)
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(
        await condicoesDasFotos(eventoId, filtro),
        ids ? inArray(t.fotos.id, ids) : undefined,
        depois ? gt(t.fotos.id, depois) : undefined,
      ),
    )
    .orderBy(asc(t.fotos.id))
    .limit(limite);
  return linhas.map(paraOriginal);
}

/** O original de uma foto pronta (excluída também), de qualquer evento e autor; ou `null`. */
export async function originalParaAGestao(fotoId: string): Promise<OriginalDaGestao | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select(colunasDoOriginal)
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      and(eq(t.fotos.id, fotoId), eq(t.fotos.status, "pronta"), isNotNull(t.fotos.chaveOriginal)),
    );
  return linha ? paraOriginal(linha) : null;
}

/** O evento existe (para validar o pedido de lote antes de qualquer consulta pesada). */
export async function eventoExisteParaAGestao(eventoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  return linha !== undefined;
}

// ---------------------------------------------------------------- Auditoria

/** Registra um original (ou um lote) entregue a um gestor: sem URLs nem chaves. */
export async function registrarDownloadDaGestao(registro: {
  gestorId: string;
  eventoId: string;
  fotoId?: string | null;
  modo: (typeof t.modoDownloadGestao.enumValues)[number];
  quantidade: number;
  ip: string | null;
}) {
  const banco = await obterBanco();
  await banco.insert(t.downloadsDaGestao).values(registro);
}

/** Downloads da gestão registrados num evento, do mais novo ao mais antigo. */
export async function downloadsDaGestaoRegistrados(eventoId: string) {
  const banco = await obterBanco();
  return banco
    .select()
    .from(t.downloadsDaGestao)
    .where(eq(t.downloadsDaGestao.eventoId, eventoId))
    .orderBy(desc(t.downloadsDaGestao.criadoEm));
}
