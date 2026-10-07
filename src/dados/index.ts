// Camada de dados do app. As telas só importam daqui, nunca de ./exemplo nem do banco
// direto: na Fase 11 (docs/tarefas.md) esta implementação de exemplo é trocada pela do
// Drizzle mantendo as mesmas assinaturas.
//
// As regras de quem vê o quê ficam aqui, e não nas telas, para valerem em qualquer caminho
// (página, Server Action, link direto para uma foto).

import "server-only";

import { connection } from "next/server";

import { categorias, colaboradores, eventos, fotografos, fotos } from "./exemplo/dados";
import { itensPorPedido, lancamentos, pedidos } from "./exemplo/pedidos";
import type {
  Evento,
  EventoResumo,
  Foto,
  Fotografo,
  FotografoConta,
  ItemPedido,
  Lancamento,
  PaginaDeFotos,
  PedidoInterno,
  SituacaoGaleria,
  StatusPedido,
} from "./tipos";

export type * from "./tipos";

const FUSO = "America/Sao_Paulo";

/**
 * Hora atual. Espera a requisição antes (`connection`), porque com Cache Components o Next
 * não deixa ler o relógio durante a pré-renderização. No banco, a comparação vira NOW().
 */
async function agora() {
  await connection();
  return Date.now();
}

/** Item que pode aparecer para o público: pronto e não excluído. */
function itemVisivel(foto: Foto) {
  return foto.status === "pronta" && foto.excluidaEm === null;
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Data AAAA-MM-DD de um instante, no horário de Brasília. */
function diaEmBrasilia(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso));
}

function perfilPublico(conta: FotografoConta): Fotografo {
  // Nunca devolver a conta inteira: CPF/CNPJ e conta de recebimento não saem daqui.
  return {
    id: conta.id,
    nomePublico: conta.nomePublico,
    slug: conta.slug,
    bio: conta.bio,
    fotoPerfil: conta.fotoPerfil,
    capa: conta.capa,
    redesSociais: conta.redesSociais,
  };
}

function situacaoGaleria(evento: Evento, instante: number): SituacaoGaleria {
  if (evento.liberacao !== "automatica") {
    const liberado =
      evento.liberadoEm !== null && new Date(evento.liberadoEm).getTime() <= instante;
    if (!liberado) return { tipo: "aguardando_liberacao", liberaEm: evento.liberadoEm };
  }
  // A tela de senha entra na Fase 7; até lá, a galeria de evento com senha fica fechada.
  if (evento.visibilidade === "senha") return { tipo: "senha" };
  if (evento.fotosSoAposBusca) return { tipo: "so_apos_busca" };
  return { tipo: "aberta" };
}

function itensVisiveisDoEvento(evento: Evento) {
  const doEvento = fotos.filter((f) => f.eventoId === evento.id && itemVisivel(f));
  return ordenar(doEvento, evento);
}

/** Ordem da galeria, escolhida pelo fotógrafo. Sempre estável, para o cursor funcionar. */
function ordenar(itens: Foto[], evento: Evento) {
  const desempate = (a: Foto, b: Foto) => a.id.localeCompare(b.id);
  const chave: Record<Evento["ordenacao"], (a: Foto, b: Foto) => number> = {
    envio: (a, b) => a.criadoEm.localeCompare(b.criadoEm),
    captura: (a, b) => (a.capturadaEm ?? a.criadoEm).localeCompare(b.capturadaEm ?? b.criadoEm),
    nome_arquivo: (a, b) => a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR", { numeric: true }),
    // "Aleatória" fixa por evento: embaralha igual em toda visita, senão a paginação repetiria fotos.
    aleatoria: (a, b) => embaralhar(a.id, evento.id) - embaralhar(b.id, evento.id),
  };
  return [...itens].sort((a, b) => chave[evento.ordenacao](a, b) || desempate(a, b));
}

function embaralhar(id: string, semente: string) {
  let h = 2166136261;
  for (const c of id + semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function resumir(evento: Evento, instante: number): EventoResumo {
  const conta = fotografos.find((f) => f.id === evento.fotografoId);
  const categoria = categorias.find((c) => c.id === evento.categoriaId);
  if (!conta || !categoria)
    throw new Error(`Evento ${evento.id} com fotógrafo ou categoria inválidos`);
  const visiveis = itensVisiveisDoEvento(evento);
  const situacao = situacaoGaleria(evento, instante);
  // A capa só usa uma foto do evento se a galeria estiver aberta; senão mostraria o que não deve.
  const capa = situacao.tipo === "aberta" ? visiveis[0] : undefined;
  return {
    ...evento,
    fotografo: perfilPublico(conta),
    categoria,
    totalItens: visiveis.length,
    totalFotos: visiveis.filter((f) => f.tipo === "foto").length,
    totalVideos: visiveis.filter((f) => f.tipo === "video").length,
    capaMiniatura: capa
      ? { urlMiniatura: capa.urlMiniatura, largura: capa.largura, altura: capa.altura }
      : null,
    situacaoGaleria: situacao,
  };
}

export type FiltroEventos = {
  /** Busca no título, local, cidade, UF, categoria e fotógrafo, sem diferenciar acentos. */
  busca?: string;
  /** Dia do evento, AAAA-MM-DD, no horário de Brasília. */
  data?: string;
};

/**
 * Eventos que aparecem na lista pública, do mais recente para o mais antigo: publicados e
 * listados. Eventos não listados só abrem pelo link.
 */
export async function listarEventosPublicados(filtro: FiltroEventos = {}): Promise<EventoResumo[]> {
  const instante = await agora();
  const termo = filtro.busca ? normalizar(filtro.busca.trim()) : "";
  return eventos
    .filter((e) => e.status === "publicado" && e.listado && e.visibilidade !== "nao_listado")
    .filter((e) => !filtro.data || diaEmBrasilia(e.inicioEm) === filtro.data)
    .map((e) => resumir(e, instante))
    .filter(
      (e) =>
        !termo ||
        normalizar(
          `${e.titulo} ${e.local} ${e.cidade} ${e.estado} ${e.categoria.nome} ${e.fotografo.nomePublico}`,
        ).includes(termo),
    )
    .sort((a, b) => b.inicioEm.localeCompare(a.inicioEm));
}

/** Slugs de todos os eventos publicados, para pré-renderizar no build (sem ler o relógio). */
export async function listarSlugsPublicados(): Promise<string[]> {
  return eventos.filter((e) => e.status === "publicado").map((e) => e.slug);
}

/** Evento publicado pelo slug (inclusive não listado ou com senha), ou `null`. */
export async function buscarEventoPublicado(slug: string): Promise<EventoResumo | null> {
  const evento = eventos.find((e) => e.slug === slug && e.status === "publicado");
  return evento ? resumir(evento, await agora()) : null;
}

/**
 * Itens da galeria aberta de um evento, paginados por cursor (docs/riscos.md: galeria lenta).
 * Se a galeria não está aberta (aguardando liberação, com senha ou só após a busca), devolve
 * vazio. O cursor é o id do último item da página anterior.
 */
export async function listarFotosDoEvento(
  eventoId: string,
  { cursor, limite = 48 }: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaDeFotos> {
  const evento = eventos.find((e) => e.id === eventoId && e.status === "publicado");
  if (!evento || situacaoGaleria(evento, await agora()).tipo !== "aberta") {
    return { fotos: [], proximoCursor: null };
  }
  const itens = itensVisiveisDoEvento(evento);
  // Cursor desconhecido dá findIndex -1, então começa do início em vez de dar página vazia.
  const inicio = cursor ? itens.findIndex((f) => f.id === cursor) + 1 : 0;
  const pagina = itens.slice(inicio, inicio + limite);
  const ultima = pagina.at(-1);
  const temMais = ultima !== undefined && itens.at(-1)?.id !== ultima.id;
  return { fotos: pagina, proximoCursor: temMais ? ultima.id : null };
}

export type FotoPublica = {
  foto: Foto;
  evento: EventoResumo;
  /** Preço que vale para este item: o individual ou o do evento para o tipo. */
  precoCentavos: number;
  /** Posição na galeria, começando em 1; `null` quando não há navegação. */
  posicao: number | null;
  anteriorId: string | null;
  proximaId: string | null;
};

export function precoDoItem(foto: Foto, evento: Evento) {
  return (
    foto.precoCentavos ??
    (foto.tipo === "video" ? evento.precoVideoCentavos : evento.precoFotoCentavos)
  );
}

/**
 * Item de evento publicado aberto pelo link direto, ou `null`.
 * - Galeria aberta: com anterior e próxima.
 * - Só após a busca: abre (o id veio do resultado da busca e não dá para adivinhar), mas sem
 *   navegação, que mostraria as fotos de outras pessoas.
 * - Aguardando liberação ou com senha: não abre.
 */
export async function buscarFotoPublica(fotoId: string): Promise<FotoPublica | null> {
  const foto = fotos.find((f) => f.id === fotoId && itemVisivel(f));
  if (!foto) return null;
  const evento = eventos.find((e) => e.id === foto.eventoId && e.status === "publicado");
  if (!evento) return null;

  const resumo = resumir(evento, await agora());
  const situacao = resumo.situacaoGaleria.tipo;
  if (situacao === "aguardando_liberacao" || situacao === "senha") return null;

  const base = { foto, evento: resumo, precoCentavos: precoDoItem(foto, evento) };
  if (situacao === "so_apos_busca") {
    return { ...base, posicao: null, anteriorId: null, proximaId: null };
  }
  const itens = itensVisiveisDoEvento(evento);
  const indice = itens.findIndex((f) => f.id === foto.id);
  return {
    ...base,
    posicao: indice + 1,
    anteriorId: itens[indice - 1]?.id ?? null,
    proximaId: itens[indice + 1]?.id ?? null,
  };
}

export type ItemParaCompra = {
  foto: Foto;
  evento: Evento;
  /** Preço lido dos dados, nunca do navegador. */
  precoCentavos: number;
};

/**
 * Itens à venda pelos ids, com o preço vindo dos dados e nunca do navegador
 * (docs/riscos.md, prioridade alta). Ids inválidos, itens indisponíveis ou de eventos ainda
 * não liberados são ignorados.
 */
export async function buscarItensParaCompra(ids: string[]): Promise<ItemParaCompra[]> {
  const instante = await agora();
  const unicos = new Set(ids);
  return fotos
    .filter((f) => unicos.has(f.id) && itemVisivel(f))
    .flatMap((foto) => {
      const evento = eventos.find((e) => e.id === foto.eventoId && e.status === "publicado");
      if (!evento || situacaoGaleria(evento, instante).tipo === "aguardando_liberacao") return [];
      return [{ foto, evento, precoCentavos: precoDoItem(foto, evento) }];
    });
}

// ---------------------------------------------------------------- Pedidos

/** Quem recebe por um item: o autor da foto, o dono do evento e a comissão da plataforma. */
export type RegraDeDivisao = {
  fotoId: string;
  autorId: string;
  donoEventoId: string;
  comissaoPlataformaPct: number;
  /** Parte do dono sobre o restante, quando o autor é colaborador; 0 quando o autor é o dono. */
  comissaoDonoPct: number;
};

export async function buscarRegrasDeDivisao(fotoIds: string[]): Promise<RegraDeDivisao[]> {
  return fotoIds.flatMap((fotoId) => {
    const foto = fotos.find((f) => f.id === fotoId);
    const evento = foto && eventos.find((e) => e.id === foto.eventoId);
    const dono = evento && fotografos.find((f) => f.id === evento.fotografoId);
    if (!foto || !evento || !dono) return [];
    const colaborador =
      foto.enviadaPor !== dono.id
        ? colaboradores.find((c) => c.eventoId === evento.id && c.fotografoId === foto.enviadaPor)
        : undefined;
    return [
      {
        fotoId,
        autorId: foto.enviadaPor,
        donoEventoId: dono.id,
        comissaoPlataformaPct: dono.comissaoPct,
        comissaoDonoPct: colaborador?.comissaoDonoPct ?? 0,
      },
    ];
  });
}

export async function salvarPedido(pedido: PedidoInterno, itens: ItemPedido[]) {
  pedidos.set(pedido.id, structuredClone(pedido));
  itensPorPedido.set(pedido.id, structuredClone(itens));
}

export async function buscarPedido(
  id: string,
): Promise<{ pedido: PedidoInterno; itens: ItemPedido[] } | null> {
  const pedido = pedidos.get(id);
  if (!pedido) return null;
  return { pedido: structuredClone(pedido), itens: structuredClone(itensPorPedido.get(id) ?? []) };
}

/**
 * Muda o status só se o pedido ainda estiver no status esperado, como um
 * `UPDATE pedidos SET status = … WHERE id = … AND status = …` no banco. Devolve se mudou.
 * É o que deixa o webhook idempotente (docs/riscos.md, prioridade alta).
 */
export async function mudarStatusPedido(
  id: string,
  de: StatusPedido,
  para: StatusPedido,
  extra: Partial<Pick<PedidoInterno, "pagoEm" | "gatewayId">> = {},
): Promise<boolean> {
  const pedido = pedidos.get(id);
  if (!pedido || pedido.status !== de) return false;
  pedidos.set(id, { ...pedido, ...extra, status: para });
  return true;
}

export async function salvarLancamentos(novos: Lancamento[]) {
  lancamentos.push(...structuredClone(novos));
}

/** Itens de um pedido com o que a tela de confirmação mostra. */
export async function detalharItensDoPedido(itens: ItemPedido[]) {
  return itens.flatMap((item) => {
    const foto = fotos.find((f) => f.id === item.fotoId);
    const evento = foto && eventos.find((e) => e.id === foto.eventoId);
    if (!foto || !evento) return [];
    return [
      {
        item,
        tipo: foto.tipo,
        urlMiniatura: foto.urlMiniatura,
        eventoTitulo: evento.titulo,
        eventoSlug: evento.slug,
      },
    ];
  });
}
