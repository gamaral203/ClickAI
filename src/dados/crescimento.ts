// Dados de crescimento do fotógrafo: métricas de visita e carrinho, dashboard, desempenho por
// evento, modelos de evento, cópia de evento e fotos repetidas. Como em ./painel.ts, toda
// função do painel recebe o id do fotógrafo logado e só lê o que é dele.

import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { iso, omitir } from "./mapas";
import type { ConfigModelo, Evento, Foto, Fotografo, ModeloEvento, TipoMetrica } from "./tipos";

const DIA_MS = 24 * 60 * 60 * 1000;

/** "2026-10-07" no horário de Brasília, para agrupar vendas por dia e por mês. */
function diaEmBrasilia(instante: number | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(instante),
  );
}

// ---------------------------------------------------------------- Métricas

/**
 * Registra uma visita ou adição ao carrinho. Só conta evento publicado e foto visível desse
 * evento; nada identifica quem visitou. Devolve se registrou.
 */
export async function registrarMetrica(
  tipo: TipoMetrica,
  ids: { eventoId?: string; fotoId?: string },
): Promise<boolean> {
  const banco = await obterBanco();
  let eventoId = ids.eventoId;
  let fotoId: string | null = null;
  if (ids.fotoId) {
    const [foto] = await banco
      .select({ id: t.fotos.id, eventoId: t.fotos.eventoId })
      .from(t.fotos)
      .where(and(eq(t.fotos.id, ids.fotoId), isNull(t.fotos.excluidaEm)));
    if (!foto) return false;
    fotoId = foto.id;
    eventoId = foto.eventoId;
  }
  // Carrinho e visita de foto precisam da foto, não só do evento.
  if (!eventoId || (tipo !== "visita_evento" && !fotoId)) return false;
  const [evento] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.status, "publicado")));
  if (!evento) return false;
  await banco.insert(t.metricas).values({ tipo, eventoId: evento.id, fotoId });
  return true;
}

// ---------------------------------------------------------------- Vendas do fotógrafo

type VendaDoFotografo = { pedidoId: string; pagoEm: string; valorCentavos: number };

/**
 * Uma linha por pedido pago em que o fotógrafo tem parte (como autor ou dono do evento), com
 * a soma da parte dele. Base do dashboard.
 */
async function vendasDoFotografo(fotografoId: string): Promise<VendaDoFotografo[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      pedidoId: t.pedidos.id,
      pagoEm: t.pedidos.pagoEm,
      valorCentavos: sql<number>`sum(${t.lancamentos.valorCentavos})::int`,
    })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .where(
      and(
        eq(t.lancamentos.fotografoId, fotografoId),
        eq(t.pedidos.status, "pago"),
        isNotNull(t.pedidos.pagoEm),
      ),
    )
    .groupBy(t.pedidos.id, t.pedidos.pagoEm);
  return linhas.flatMap((l) =>
    l.pagoEm
      ? [{ pedidoId: l.pedidoId, pagoEm: iso(l.pagoEm), valorCentavos: l.valorCentavos }]
      : [],
  );
}

export type DashboardDoFotografo = {
  hoje: { valorCentavos: number; pedidos: number };
  mes: { valorCentavos: number; pedidos: number };
  /** Valor médio por pedido nos últimos 30 dias. */
  ticketMedioCentavos: number;
  /** Pedidos pagos ÷ visitas aos eventos, nos últimos 30 dias (0 a 1); `null` sem visitas. */
  conversao: number | null;
  visitas30d: number;
  pedidos30d: number;
};

export async function dashboardDoFotografo(fotografoId: string): Promise<DashboardDoFotografo> {
  await connection();
  const agora = Date.now();
  const hoje = diaEmBrasilia(agora);
  const mes = hoje.slice(0, 7);
  const vendas = await vendasDoFotografo(fotografoId);
  const recentes = vendas.filter((v) => agora - new Date(v.pagoEm).getTime() <= 30 * DIA_MS);
  const soma = (lista: VendaDoFotografo[]) => lista.reduce((s, v) => s + v.valorCentavos, 0);
  const deHoje = vendas.filter((v) => diaEmBrasilia(v.pagoEm) === hoje);
  const doMes = vendas.filter((v) => diaEmBrasilia(v.pagoEm).startsWith(mes));

  const banco = await obterBanco();
  const [{ visitas30d }] = await banco
    .select({ visitas30d: sql<number>`count(*)::int` })
    .from(t.metricas)
    .innerJoin(t.eventos, eq(t.eventos.id, t.metricas.eventoId))
    .where(
      and(
        eq(t.metricas.tipo, "visita_evento"),
        eq(t.eventos.fotografoId, fotografoId),
        gte(t.metricas.em, new Date(agora - 30 * DIA_MS)),
      ),
    );

  return {
    hoje: { valorCentavos: soma(deHoje), pedidos: deHoje.length },
    mes: { valorCentavos: soma(doMes), pedidos: doMes.length },
    ticketMedioCentavos: recentes.length ? Math.round(soma(recentes) / recentes.length) : 0,
    conversao: visitas30d ? recentes.length / visitas30d : null,
    visitas30d,
    pedidos30d: recentes.length,
  };
}

// ---------------------------------------------------------------- Desempenho

export type DesempenhoDoEvento = {
  evento: Pick<Evento, "id" | "titulo" | "slug" | "status" | "inicioEm">;
  visitas: number;
  carrinhos: number;
  pedidos: number;
  itensVendidos: number;
  /** O que os clientes pagaram pelos itens do evento (com desconto). */
  faturamentoCentavos: number;
  /** Pedidos ÷ visitas (0 a 1); `null` sem visitas. */
  conversao: number | null;
};

export type FotoEmDestaque = {
  foto: Pick<Foto, "id" | "urlMiniatura">;
  eventoTitulo: string;
  vendas: number;
  visitas: number;
};

/** Desempenho de cada evento do fotógrafo e as fotos que mais vendem. */
export async function desempenhoDoFotografo(fotografoId: string): Promise<{
  eventos: DesempenhoDoEvento[];
  fotos: FotoEmDestaque[];
}> {
  await connection();
  const banco = await obterBanco();
  const meus = await banco
    .select({
      id: t.eventos.id,
      titulo: t.eventos.titulo,
      slug: t.eventos.slug,
      status: t.eventos.status,
      inicioEm: t.eventos.inicioEm,
    })
    .from(t.eventos)
    .where(eq(t.eventos.fotografoId, fotografoId));
  if (meus.length === 0) return { eventos: [], fotos: [] };
  const ids = meus.map((e) => e.id);

  const [vendas, metricasPorEvento, destaque, visitasFoto] = await Promise.all([
    banco
      .select({
        eventoId: t.fotos.eventoId,
        pedidos: sql<number>`count(distinct ${t.pedidos.id})::int`,
        itens: sql<number>`count(*)::int`,
        faturamento: sql<number>`sum(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos})::int`,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(and(eq(t.pedidos.status, "pago"), inArray(t.fotos.eventoId, ids)))
      .groupBy(t.fotos.eventoId),
    banco
      .select({
        eventoId: t.metricas.eventoId,
        visitas: sql<number>`count(*) filter (where ${t.metricas.tipo} = 'visita_evento')::int`,
        carrinhos: sql<number>`count(*) filter (where ${t.metricas.tipo} = 'carrinho')::int`,
      })
      .from(t.metricas)
      .where(inArray(t.metricas.eventoId, ids))
      .groupBy(t.metricas.eventoId),
    banco
      .select({
        fotoId: t.fotos.id,
        urlMiniatura: t.fotos.urlMiniatura,
        eventoTitulo: t.eventos.titulo,
        vendas: sql<number>`count(*)::int`,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
      .where(and(eq(t.pedidos.status, "pago"), inArray(t.fotos.eventoId, ids)))
      .groupBy(t.fotos.id, t.fotos.urlMiniatura, t.eventos.titulo)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    banco
      .select({ fotoId: t.metricas.fotoId, total: sql<number>`count(*)::int` })
      .from(t.metricas)
      .where(and(eq(t.metricas.tipo, "visita_foto"), inArray(t.metricas.eventoId, ids)))
      .groupBy(t.metricas.fotoId),
  ]);

  const linhas = meus
    .map((e) => {
      const v = vendas.find((x) => x.eventoId === e.id);
      const m = metricasPorEvento.find((x) => x.eventoId === e.id);
      const visitas = m?.visitas ?? 0;
      const pedidos = v?.pedidos ?? 0;
      return {
        evento: { ...e, inicioEm: iso(e.inicioEm) },
        visitas,
        carrinhos: m?.carrinhos ?? 0,
        pedidos,
        itensVendidos: v?.itens ?? 0,
        faturamentoCentavos: v?.faturamento ?? 0,
        conversao: visitas ? pedidos / visitas : null,
      };
    })
    .sort((a, b) => b.faturamentoCentavos - a.faturamentoCentavos || b.visitas - a.visitas);

  return {
    eventos: linhas,
    fotos: destaque.map((d) => ({
      foto: { id: d.fotoId, urlMiniatura: d.urlMiniatura },
      eventoTitulo: d.eventoTitulo,
      vendas: d.vendas,
      visitas: visitasFoto.find((x) => x.fotoId === d.fotoId)?.total ?? 0,
    })),
  };
}

// ---------------------------------------------------------------- Modelos e cópia de evento

/** O que um modelo guarda de um evento: tudo menos nome, datas, senha e fotos. */
export function configDoEvento(evento: Evento): ConfigModelo {
  return {
    categoriaId: evento.categoriaId,
    local: evento.local,
    cidade: evento.cidade,
    estado: evento.estado,
    precoFotoCentavos: evento.precoFotoCentavos,
    precoVideoCentavos: evento.precoVideoCentavos,
    // Senha não vai para o modelo: o evento novo nasce público e cada um define a sua.
    visibilidade: evento.visibilidade === "senha" ? "publico" : evento.visibilidade,
    fotosSoAposBusca: evento.fotosSoAposBusca,
    // Liberação agendada depende da data de cada evento; o modelo usa a automática.
    liberacao: evento.liberacao === "agendada" ? "automatica" : evento.liberacao,
    filtroHorario: evento.filtroHorario,
    listarNaoIdentificadas: evento.listarNaoIdentificadas,
    ordenacao: evento.ordenacao,
  };
}

function paraModelo(r: typeof t.modelosEvento.$inferSelect): ModeloEvento {
  return { ...r, criadoEm: iso(r.criadoEm) };
}

export async function listarModelos(fotografoId: string): Promise<ModeloEvento[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.modelosEvento)
    .where(eq(t.modelosEvento.fotografoId, fotografoId))
    .orderBy(asc(t.modelosEvento.nome));
  return linhas.map(paraModelo);
}

export async function buscarModelo(
  modeloId: string,
  fotografoId: string,
): Promise<ModeloEvento | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.modelosEvento)
    .where(and(eq(t.modelosEvento.id, modeloId), eq(t.modelosEvento.fotografoId, fotografoId)));
  return linha ? paraModelo(linha) : null;
}

/** Salva a configuração de um evento do fotógrafo como modelo. `null` se o evento não for dele. */
export async function salvarModeloDoEvento(
  eventoId: string,
  fotografoId: string,
  nome: string,
): Promise<ModeloEvento | null> {
  const banco = await obterBanco();
  const [evento] = await banco
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  if (!evento) return null;
  const config = configDoEvento({
    ...omitir(evento, "senhaHash"),
    inicioEm: iso(evento.inicioEm),
    fimEm: iso(evento.fimEm),
    liberadoEm: iso(evento.liberadoEm),
  });
  const [linha] = await banco
    .insert(t.modelosEvento)
    .values({ fotografoId, nome, config })
    .returning();
  return paraModelo(linha);
}

export async function excluirModelo(modeloId: string, fotografoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const apagados = await banco
    .delete(t.modelosEvento)
    .where(and(eq(t.modelosEvento.id, modeloId), eq(t.modelosEvento.fotografoId, fotografoId)))
    .returning({ id: t.modelosEvento.id });
  return apagados.length > 0;
}

/**
 * Copia para o evento novo as faixas de desconto e o pacote do evento de origem, dos dois só
 * se forem do mesmo fotógrafo.
 */
export async function copiarDescontosDoEvento(
  origemId: string,
  destinoId: string,
  fotografoId: string,
): Promise<boolean> {
  const banco = await obterBanco();
  const donos = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(
      and(inArray(t.eventos.id, [origemId, destinoId]), eq(t.eventos.fotografoId, fotografoId)),
    );
  if (new Set(donos.map((d) => d.id)).size !== new Set([origemId, destinoId]).size) return false;
  await banco.transaction(async (tx) => {
    const faixas = await tx
      .select()
      .from(t.faixasDesconto)
      .where(eq(t.faixasDesconto.eventoId, origemId));
    if (faixas.length > 0) {
      await tx
        .insert(t.faixasDesconto)
        .values(faixas.map((f) => ({ ...omitir(f, "id"), eventoId: destinoId })));
    }
    const [pacote] = await tx.select().from(t.pacotes).where(eq(t.pacotes.eventoId, origemId));
    if (pacote) {
      await tx
        .insert(t.pacotes)
        .values({ ...omitir(pacote, "id"), eventoId: destinoId })
        .onConflictDoNothing();
    }
  });
  return true;
}

// ---------------------------------------------------------------- Fotos repetidas

/** Assinaturas (SHA-256) das fotos já enviadas ao evento e ainda não excluídas. */
export async function hashesDoEvento(eventoId: string): Promise<Set<string>> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ hash: t.fotos.hashConteudo })
    .from(t.fotos)
    .where(
      and(
        eq(t.fotos.eventoId, eventoId),
        isNull(t.fotos.excluidaEm),
        isNotNull(t.fotos.hashConteudo),
      ),
    );
  return new Set(linhas.flatMap((l) => (l.hash ? [l.hash] : [])));
}

/** Grava a assinatura de cada foto enviada (`fotos.hash_conteudo`). */
export async function registrarHashes(eventoId: string, pares: { hash: string; fotoId: string }[]) {
  const banco = await obterBanco();
  for (const { hash, fotoId } of pares) {
    await banco
      .update(t.fotos)
      .set({ hashConteudo: hash })
      .where(and(eq(t.fotos.id, fotoId), eq(t.fotos.eventoId, eventoId)));
  }
}

// ---------------------------------------------------------------- Link do fotógrafo

/**
 * Perfil público do fotógrafo pelo endereço (/fotografo/<slug>), para a página com só os eventos
 * dele. Nunca devolve dados da conta (CPF/CNPJ, chave Pix, comissão).
 */
export async function buscarFotografoPublico(slug: string): Promise<Fotografo | null> {
  const banco = await obterBanco();
  const [f] = await banco
    .select({
      id: t.fotografos.id,
      nomePublico: t.fotografos.nomePublico,
      slug: t.fotografos.slug,
      bio: t.fotografos.bio,
      fotoPerfil: t.fotografos.fotoPerfil,
      capa: t.fotografos.capa,
      redesSociais: t.fotografos.redesSociais,
    })
    .from(t.fotografos)
    .where(eq(t.fotografos.slug, slug));
  return f ?? null;
}

// ---------------------------------------------------------------- Vendas por dia (gráficos)

export type VendasDoDia = {
  /** "2026-10-07", no horário de Brasília. */
  dia: string;
  valorCentavos: number;
  pedidos: number;
};

/** Os últimos `dias` dias, do mais antigo para hoje, com zero nos dias sem venda. */
function serieDeDias(
  vendas: { pagoEm: string; valorCentavos: number }[],
  dias: number,
  agora: number,
): VendasDoDia[] {
  const porDia = new Map<string, VendasDoDia>();
  for (let i = dias - 1; i >= 0; i--) {
    const dia = diaEmBrasilia(agora - i * DIA_MS);
    porDia.set(dia, { dia, valorCentavos: 0, pedidos: 0 });
  }
  for (const v of vendas) {
    const linha = porDia.get(diaEmBrasilia(v.pagoEm));
    if (!linha) continue;
    linha.valorCentavos += v.valorCentavos;
    linha.pedidos++;
  }
  return [...porDia.values()];
}

/** Vendas do fotógrafo por dia (a parte dele, bruta) nos últimos `dias` dias. */
export async function vendasPorDiaDoFotografo(
  fotografoId: string,
  dias = 30,
): Promise<VendasDoDia[]> {
  await connection();
  return serieDeDias(await vendasDoFotografo(fotografoId), dias, Date.now());
}

/** Tudo o que entrou na plataforma por dia (total dos pedidos pagos), para a gestão. */
export async function vendasPorDiaDaPlataforma(dias = 30): Promise<VendasDoDia[]> {
  await connection();
  const agora = Date.now();
  const banco = await obterBanco();
  const pagos = await banco
    .select({ pagoEm: t.pedidos.pagoEm, valorCentavos: t.pedidos.totalCentavos })
    .from(t.pedidos)
    .where(
      and(
        eq(t.pedidos.status, "pago"),
        isNotNull(t.pedidos.pagoEm),
        // Um dia a mais de folga por causa do fuso; a série descarta o que ficar de fora.
        gte(t.pedidos.pagoEm, new Date(agora - (dias + 1) * DIA_MS)),
      ),
    );
  return serieDeDias(
    pagos.flatMap((p) =>
      p.pagoEm ? [{ pagoEm: iso(p.pagoEm), valorCentavos: p.valorCentavos }] : [],
    ),
    dias,
    agora,
  );
}
