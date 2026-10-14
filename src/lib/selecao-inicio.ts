import type { EventoResumo, Fotografo } from "@/dados/tipos";

// Quais eventos e fotógrafos aparecem na página inicial. Funções puras: a página lê os eventos
// listados (`listarEventosPublicados`, que já respeita publicação, listagem, liberação, senha e
// capa) e as vendas da semana uma vez só, e decide aqui.

/** Cartões em "Eventos em destaque". */
export const DESTAQUES_NA_INICIAL = 4;
/** Cartões em "Eventos recentes". */
export const RECENTES_NA_INICIAL = 8;
/** Cartões em "Fotógrafos em destaque". */
export const FOTOGRAFOS_NA_INICIAL = 8;
/**
 * Com menos eventos que isso, o destaque não é completado com os recentes: os poucos eventos
 * ficam todos em "Eventos recentes", sem a página repetir ou esvaziar uma seção.
 */
export const MINIMO_PARA_COMPLETAR_DESTAQUE = 6;

/**
 * Destaque: os eventos que mais venderam fotos nos últimos 7 dias (o antigo "Em alta"). Se houver
 * eventos suficientes, completa com os mais recentes que têm capa. Recentes: o resto, do mais
 * novo para o mais antigo. Um evento nunca aparece nas duas seções.
 *
 * `eventos` vem ordenado do mais recente para o mais antigo; `vendas` do mais vendido para o
 * menos (pares [eventoId, quantidade]).
 */
export function separarEventosDaInicial(
  eventos: EventoResumo[],
  vendas: [string, number][],
): { destaques: EventoResumo[]; recentes: EventoResumo[]; total: number } {
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const destaques = vendas.flatMap(([id]) => porId.get(id) ?? []).slice(0, DESTAQUES_NA_INICIAL);
  if (eventos.length >= MINIMO_PARA_COMPLETAR_DESTAQUE) {
    for (const evento of eventos) {
      if (destaques.length >= DESTAQUES_NA_INICIAL) break;
      if (evento.capaMiniatura && !destaques.includes(evento)) destaques.push(evento);
    }
  }
  const escolhidos = new Set(destaques.map((e) => e.id));
  const recentes = eventos.filter((e) => !escolhidos.has(e.id)).slice(0, RECENTES_NA_INICIAL);
  return { destaques, recentes, total: eventos.length };
}

export type FotografoDaInicial = {
  fotografo: Fotografo;
  /** Até duas categorias dos eventos dele, as mais frequentes primeiro. */
  especialidades: string[];
};

/**
 * Fotógrafos em destaque: os donos dos eventos listados, do que publicou o evento mais recente
 * para o mais antigo, sem repetir. Especialidade = categorias dos eventos dele. Sem notas nem
 * avaliações: o ClicouAí não tem esse dado.
 */
export function fotografosDaInicial(eventos: EventoResumo[]): FotografoDaInicial[] {
  const porFotografo = new Map<string, { fotografo: Fotografo; categorias: Map<string, number> }>();
  for (const evento of eventos) {
    const atual = porFotografo.get(evento.fotografo.id) ?? {
      fotografo: evento.fotografo,
      categorias: new Map<string, number>(),
    };
    const nome = evento.categoria.nome;
    atual.categorias.set(nome, (atual.categorias.get(nome) ?? 0) + 1);
    porFotografo.set(evento.fotografo.id, atual);
  }
  return [...porFotografo.values()].slice(0, FOTOGRAFOS_NA_INICIAL).map((f) => ({
    fotografo: f.fotografo,
    especialidades: [...f.categorias.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([nome]) => nome),
  }));
}
