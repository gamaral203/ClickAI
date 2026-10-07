// Camada de dados do app. As telas só importam daqui, nunca de ./exemplo nem do banco
// direto: na Fase 8 (docs/tarefas.md) esta implementação de exemplo é trocada pela do
// Drizzle mantendo as mesmas assinaturas.

import "server-only";

import { eventos, fotografos, fotos } from "./exemplo/dados";
import type { Evento, EventoResumo, Foto, PaginaDeFotos } from "./tipos";

export type * from "./tipos";

/** Foto que pode aparecer na galeria pública. */
function fotoVisivel(foto: Foto) {
  return foto.status === "pronta" && foto.excluidaEm === null;
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function resumir(evento: Evento): EventoResumo {
  const fotografo = fotografos.find((f) => f.id === evento.fotografoId);
  if (!fotografo) throw new Error(`Fotógrafo ${evento.fotografoId} não encontrado`);
  const visiveis = fotos.filter((f) => f.eventoId === evento.id && fotoVisivel(f));
  const capa = visiveis[0];
  return {
    ...evento,
    fotografo,
    totalFotos: visiveis.length,
    capa: capa
      ? { urlMiniatura: capa.urlMiniatura, largura: capa.largura, altura: capa.altura }
      : null,
  };
}

export type FiltroEventos = {
  /** Busca no título, na cidade e no nome do fotógrafo, sem diferenciar acentos. */
  busca?: string;
  /** Data exata do evento, AAAA-MM-DD. */
  data?: string;
};

/** Eventos publicados, do mais recente para o mais antigo. */
export async function listarEventosPublicados(filtro: FiltroEventos = {}): Promise<EventoResumo[]> {
  const termo = filtro.busca ? normalizar(filtro.busca.trim()) : "";
  return eventos
    .filter((e) => e.status === "publicado")
    .filter((e) => !filtro.data || e.data === filtro.data)
    .map(resumir)
    .filter(
      (e) =>
        !termo || normalizar(`${e.titulo} ${e.cidade} ${e.fotografo.nomePublico}`).includes(termo),
    )
    .sort((a, b) => b.data.localeCompare(a.data));
}

/** Evento publicado pelo slug, ou `null` se não existir ou não estiver publicado. */
export async function buscarEventoPublicado(slug: string): Promise<EventoResumo | null> {
  const evento = eventos.find((e) => e.slug === slug && e.status === "publicado");
  return evento ? resumir(evento) : null;
}

/**
 * Fotos visíveis de um evento, paginadas por cursor (docs/riscos.md: galeria lenta).
 * O cursor é o id da última foto da página anterior; a ordem é por `criadoEm`.
 */
export async function listarFotosDoEvento(
  eventoId: string,
  { cursor, limite = 48 }: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaDeFotos> {
  const doEvento = fotos
    .filter((f) => f.eventoId === eventoId && fotoVisivel(f))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));
  // Cursor desconhecido dá findIndex -1, então começa do início em vez de dar página vazia.
  const inicio = cursor ? doEvento.findIndex((f) => f.id === cursor) + 1 : 0;
  const pagina = doEvento.slice(inicio, inicio + limite);
  const ultima = pagina.at(-1);
  const temMais = ultima !== undefined && doEvento.at(-1)?.id !== ultima.id;
  return { fotos: pagina, proximoCursor: temMais ? ultima.id : null };
}

/** Foto visível de um evento publicado, ou `null`. */
export async function buscarFotoPublica(
  fotoId: string,
): Promise<{ foto: Foto; evento: EventoResumo } | null> {
  const foto = fotos.find((f) => f.id === fotoId && fotoVisivel(f));
  if (!foto) return null;
  const evento = eventos.find((e) => e.id === foto.eventoId && e.status === "publicado");
  return evento ? { foto, evento: resumir(evento) } : null;
}

/**
 * Fotos à venda pelos ids, com o preço vindo dos dados e nunca do navegador
 * (docs/riscos.md, prioridade alta). Ids inválidos ou fotos indisponíveis são ignorados.
 */
export async function buscarFotosParaCompra(ids: string[]): Promise<Foto[]> {
  const unicos = new Set(ids);
  return fotos.filter((f) => unicos.has(f.id) && fotoVisivel(f));
}
