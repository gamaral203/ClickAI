// Dados de crescimento do fotógrafo: métricas de visita e carrinho, dashboard, desempenho por
// evento, modelos de evento, cópia de evento e fotos repetidas. Como em ./painel.ts, toda
// função do painel recebe o id do fotógrafo logado e só lê o que é dele.

import "server-only";

import { connection } from "next/server";

import { eventos, faixasDesconto, fotos, pacotes } from "./exemplo/banco";
import { hashesPorEvento, metricas, modelos } from "./exemplo/crescimento";
import { itensPorPedido, lancamentos, pedidos } from "./exemplo/pedidos";
import type { ConfigModelo, Evento, Foto, ModeloEvento, TipoMetrica } from "./tipos";

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
  const foto = ids.fotoId
    ? fotos.find((f) => f.id === ids.fotoId && f.excluidaEm === null)
    : undefined;
  if (ids.fotoId && !foto) return false;
  const eventoId = foto?.eventoId ?? ids.eventoId;
  const evento = eventos.find((e) => e.id === eventoId && e.status === "publicado");
  if (!evento || (tipo !== "visita_evento" && !foto)) return false;
  metricas.push({
    tipo,
    eventoId: evento.id,
    fotoId: foto?.id ?? null,
    em: new Date().toISOString(),
  });
  return true;
}

// ---------------------------------------------------------------- Vendas do fotógrafo

type VendaDoFotografo = { pedidoId: string; pagoEm: string; valorCentavos: number };

/**
 * Uma linha por pedido pago em que o fotógrafo tem parte (como autor ou dono do evento), com
 * a soma da parte dele. Base do dashboard.
 */
function vendasDoFotografo(fotografoId: string): VendaDoFotografo[] {
  const porPedido = new Map<string, VendaDoFotografo>();
  for (const [pedidoId, itens] of itensPorPedido) {
    const pedido = pedidos.get(pedidoId);
    if (pedido?.status !== "pago" || !pedido.pagoEm) continue;
    const ids = new Set(itens.map((i) => i.id));
    const meus = lancamentos.filter(
      (l) => l.fotografoId === fotografoId && ids.has(l.itemPedidoId),
    );
    if (meus.length === 0) continue;
    porPedido.set(pedidoId, {
      pedidoId,
      pagoEm: pedido.pagoEm,
      valorCentavos: meus.reduce((s, l) => s + l.valorCentavos, 0),
    });
  }
  return [...porPedido.values()];
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
  const vendas = vendasDoFotografo(fotografoId);
  const recentes = vendas.filter((v) => agora - new Date(v.pagoEm).getTime() <= 30 * DIA_MS);
  const soma = (lista: VendaDoFotografo[]) => lista.reduce((s, v) => s + v.valorCentavos, 0);
  const deHoje = vendas.filter((v) => diaEmBrasilia(v.pagoEm) === hoje);
  const doMes = vendas.filter((v) => diaEmBrasilia(v.pagoEm).startsWith(mes));

  const meusEventos = new Set(
    eventos.filter((e) => e.fotografoId === fotografoId).map((e) => e.id),
  );
  const visitas30d = metricas.filter(
    (m) =>
      m.tipo === "visita_evento" &&
      meusEventos.has(m.eventoId) &&
      agora - new Date(m.em).getTime() <= 30 * DIA_MS,
  ).length;

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
  const meus = eventos.filter((e) => e.fotografoId === fotografoId);
  const eventoDaFoto = new Map(
    fotos.filter((f) => meus.some((e) => e.id === f.eventoId)).map((f) => [f.id, f.eventoId]),
  );

  const vendasPorFoto = new Map<string, number>();
  const porEvento = new Map(
    meus.map((e) => [e.id, { pedidos: new Set<string>(), itens: 0, faturamento: 0 }]),
  );
  for (const [pedidoId, itens] of itensPorPedido) {
    if (pedidos.get(pedidoId)?.status !== "pago") continue;
    for (const item of itens) {
      const eventoId = eventoDaFoto.get(item.fotoId);
      const linha = eventoId && porEvento.get(eventoId);
      if (!linha) continue;
      linha.pedidos.add(pedidoId);
      linha.itens++;
      linha.faturamento += item.precoCentavos - item.descontoCentavos;
      vendasPorFoto.set(item.fotoId, (vendasPorFoto.get(item.fotoId) ?? 0) + 1);
    }
  }

  const contar = (
    tipo: TipoMetrica,
    chave: (m: { eventoId: string; fotoId: string | null }) => string | null,
  ) => {
    const contagem = new Map<string, number>();
    for (const m of metricas) {
      if (m.tipo !== tipo) continue;
      const k = chave(m);
      if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    return contagem;
  };
  const visitas = contar("visita_evento", (m) => m.eventoId);
  const carrinhos = contar("carrinho", (m) => m.eventoId);
  const visitasFoto = contar("visita_foto", (m) => m.fotoId);

  const linhas = meus
    .map((e) => {
      const l = porEvento.get(e.id) ?? { pedidos: new Set(), itens: 0, faturamento: 0 };
      const v = visitas.get(e.id) ?? 0;
      return {
        evento: {
          id: e.id,
          titulo: e.titulo,
          slug: e.slug,
          status: e.status,
          inicioEm: e.inicioEm,
        },
        visitas: v,
        carrinhos: carrinhos.get(e.id) ?? 0,
        pedidos: l.pedidos.size,
        itensVendidos: l.itens,
        faturamentoCentavos: l.faturamento,
        conversao: v ? l.pedidos.size / v : null,
      };
    })
    .sort((a, b) => b.faturamentoCentavos - a.faturamentoCentavos || b.visitas - a.visitas);

  const destaque = [...vendasPorFoto.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .flatMap(([fotoId, vendas]) => {
      const foto = fotos.find((f) => f.id === fotoId);
      const evento = foto && meus.find((e) => e.id === foto.eventoId);
      if (!foto || !evento) return [];
      return [
        {
          foto: { id: foto.id, urlMiniatura: foto.urlMiniatura },
          eventoTitulo: evento.titulo,
          vendas,
          visitas: visitasFoto.get(foto.id) ?? 0,
        },
      ];
    });

  return { eventos: linhas, fotos: destaque };
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

export async function listarModelos(fotografoId: string): Promise<ModeloEvento[]> {
  return structuredClone(
    modelos
      .filter((m) => m.fotografoId === fotografoId)
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  );
}

export async function buscarModelo(
  modeloId: string,
  fotografoId: string,
): Promise<ModeloEvento | null> {
  const modelo = modelos.find((m) => m.id === modeloId && m.fotografoId === fotografoId);
  return modelo ? structuredClone(modelo) : null;
}

/** Salva a configuração de um evento do fotógrafo como modelo. `null` se o evento não for dele. */
export async function salvarModeloDoEvento(
  eventoId: string,
  fotografoId: string,
  nome: string,
): Promise<ModeloEvento | null> {
  const evento = eventos.find((e) => e.id === eventoId && e.fotografoId === fotografoId);
  if (!evento) return null;
  const modelo: ModeloEvento = {
    id: crypto.randomUUID(),
    fotografoId,
    nome,
    config: configDoEvento(evento),
    criadoEm: new Date().toISOString(),
  };
  modelos.push(modelo);
  return structuredClone(modelo);
}

export async function excluirModelo(modeloId: string, fotografoId: string): Promise<boolean> {
  const indice = modelos.findIndex((m) => m.id === modeloId && m.fotografoId === fotografoId);
  if (indice < 0) return false;
  modelos.splice(indice, 1);
  return true;
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
  const dono = (id: string) => eventos.some((e) => e.id === id && e.fotografoId === fotografoId);
  if (!dono(origemId) || !dono(destinoId)) return false;
  for (const f of faixasDesconto.filter((f) => f.eventoId === origemId)) {
    faixasDesconto.push({ ...structuredClone(f), id: crypto.randomUUID(), eventoId: destinoId });
  }
  const pacote = pacotes.find((p) => p.eventoId === origemId);
  if (pacote) {
    pacotes.push({ ...structuredClone(pacote), id: crypto.randomUUID(), eventoId: destinoId });
  }
  return true;
}

// ---------------------------------------------------------------- Fotos repetidas

/** Assinaturas (SHA-256) das fotos já enviadas ao evento e ainda não excluídas. */
export async function hashesDoEvento(eventoId: string): Promise<Set<string>> {
  const doEvento = hashesPorEvento.get(eventoId) ?? new Map<string, string>();
  const ativas = new Set(
    fotos.filter((f) => f.eventoId === eventoId && f.excluidaEm === null).map((f) => f.id),
  );
  return new Set([...doEvento].filter(([, fotoId]) => ativas.has(fotoId)).map(([hash]) => hash));
}

export async function registrarHashes(eventoId: string, pares: { hash: string; fotoId: string }[]) {
  const doEvento = hashesPorEvento.get(eventoId) ?? new Map<string, string>();
  for (const { hash, fotoId } of pares) doEvento.set(hash, fotoId);
  hashesPorEvento.set(eventoId, doEvento);
}
