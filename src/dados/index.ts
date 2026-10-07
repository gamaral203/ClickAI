// Camada de dados do app. As telas só importam daqui, nunca de ./exemplo nem do banco
// direto: na Fase 11 (docs/tarefas.md) esta implementação de exemplo é trocada pela do
// Drizzle mantendo as mesmas assinaturas.
//
// As regras de quem vê o quê ficam aqui, e não nas telas, para valerem em qualquer caminho
// (página, Server Action, link direto para uma foto).

import "server-only";

import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { connection } from "next/server";

import { cookieDoEvento, hashDoToken } from "@/lib/acesso-evento";
import { HASH_FALSO, senhaConfere } from "@/lib/senha";

import {
  acessosEvento,
  categorias,
  colaboradores,
  cupons,
  eventos,
  faixasDesconto,
  fotografos,
  fotos,
  numeros,
  pacotes,
  pastas,
  rostos,
  senhasEventos,
  urlOriginalDeExemplo,
} from "./exemplo/banco";
import { downloads, itensPorPedido, lancamentos, mensagens, pedidos } from "./exemplo/pedidos";
import { confirmacoes, usuarios } from "./exemplo/usuarios";
import type {
  Cupom,
  Evento,
  EventoResumo,
  FaixaDesconto,
  Foto,
  Fotografo,
  FotografoConta,
  ItemPedido,
  Lancamento,
  Mensagem,
  Pacote,
  PaginaDeFotos,
  Papel,
  PedidoInterno,
  SituacaoGaleria,
  StatusPedido,
  Usuario,
  UsuarioInterno,
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

const formatoHora = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Hora cheia AAAA-MM-DDTHH de um instante, no horário de Brasília. */
function horaEmBrasilia(iso: string) {
  const p = Object.fromEntries(
    formatoHora.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

function perfilPublico(conta: FotografoConta): Fotografo {
  // Nunca devolver a conta inteira: CPF/CNPJ e chave Pix não saem daqui.
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

/**
 * `senhaAceita`: este navegador já acertou a senha do evento (ver `acessoPorSenha`). Nas
 * listagens fica falso: evento com senha aparece sempre fechado ali.
 */
function situacaoGaleria(evento: Evento, instante: number, senhaAceita = false): SituacaoGaleria {
  if (evento.liberacao !== "automatica") {
    const liberado =
      evento.liberadoEm !== null && new Date(evento.liberadoEm).getTime() <= instante;
    if (!liberado) return { tipo: "aguardando_liberacao", liberaEm: evento.liberadoEm };
  }
  if (evento.visibilidade === "senha" && !senhaAceita) return { tipo: "senha" };
  if (evento.fotosSoAposBusca) return { tipo: "so_apos_busca" };
  return { tipo: "aberta" };
}

/**
 * O cookie deste navegador libera o evento com senha? Confere o token guardado só como hash,
 * a validade e se a senha ainda é a mesma de quando foi aceita.
 */
async function acessoPorSenha(evento: Evento) {
  if (evento.visibilidade !== "senha") return false;
  const token = (await cookies()).get(cookieDoEvento(evento.id))?.value;
  if (!token) return false;
  const acesso = acessosEvento.get(hashDoToken(token));
  return (
    acesso !== undefined &&
    acesso.eventoId === evento.id &&
    acesso.expiraEm > Date.now() &&
    acesso.senhaHash === senhasEventos.get(evento.id)
  );
}

/** Situação da galeria para quem está fazendo esta requisição (lê o cookie da senha). */
async function situacaoParaVisitante(evento: Evento) {
  return situacaoGaleria(evento, await agora(), await acessoPorSenha(evento));
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

function resumir(evento: Evento, situacao: SituacaoGaleria): EventoResumo {
  const conta = fotografos.find((f) => f.id === evento.fotografoId);
  const categoria = categorias.find((c) => c.id === evento.categoriaId);
  if (!conta || !categoria)
    throw new Error(`Evento ${evento.id} com fotógrafo ou categoria inválidos`);
  const visiveis = itensVisiveisDoEvento(evento);
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
  /** Slug da categoria. */
  categoria?: string;
  /** Nome da cidade, sem diferenciar acentos nem maiúsculas. */
  cidade?: string;
  /** Só os eventos deste fotógrafo (página da loja própria). */
  fotografoId?: string;
};

function eventosListados() {
  return eventos.filter(
    (e) => e.status === "publicado" && e.listado && e.visibilidade !== "nao_listado",
  );
}

/**
 * Eventos que aparecem na lista pública, do mais recente para o mais antigo: publicados e
 * listados. Eventos não listados só abrem pelo link.
 */
export async function listarEventosPublicados(filtro: FiltroEventos = {}): Promise<EventoResumo[]> {
  const instante = await agora();
  const termo = filtro.busca ? normalizar(filtro.busca.trim()) : "";
  const categoriaId = filtro.categoria
    ? (categorias.find((c) => c.slug === filtro.categoria)?.id ?? "nenhuma")
    : null;
  const cidade = filtro.cidade ? normalizar(filtro.cidade) : null;
  return eventosListados()
    .filter((e) => !filtro.data || diaEmBrasilia(e.inicioEm) === filtro.data)
    .filter((e) => !categoriaId || e.categoriaId === categoriaId)
    .filter((e) => !cidade || normalizar(e.cidade) === cidade)
    .filter((e) => !filtro.fotografoId || e.fotografoId === filtro.fotografoId)
    .map((e) => resumir(e, situacaoGaleria(e, instante)))
    .filter(
      (e) =>
        !termo ||
        normalizar(
          `${e.titulo} ${e.local} ${e.cidade} ${e.estado} ${e.categoria.nome} ${e.fotografo.nomePublico}`,
        ).includes(termo),
    )
    .sort((a, b) => b.inicioEm.localeCompare(a.inicioEm));
}

export type OpcoesFiltroEventos = {
  categorias: { slug: string; nome: string }[];
  cidades: { nome: string; estado: string }[];
};

/** Categorias e cidades que têm evento na lista pública, para os filtros (sem opção vazia). */
export async function listarOpcoesFiltroEventos(): Promise<OpcoesFiltroEventos> {
  const listados = eventosListados();
  const categoriaIds = new Set(listados.map((e) => e.categoriaId));
  const cidades = new Map(listados.map((e) => [normalizar(e.cidade), e]));
  return {
    categorias: categorias
      .filter((c) => categoriaIds.has(c.id))
      .map((c) => ({ slug: c.slug, nome: c.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    cidades: [...cidades.values()]
      .map((e) => ({ nome: e.cidade, estado: e.estado }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** Slugs de todos os eventos publicados, para pré-renderizar no build (sem ler o relógio). */
export async function listarSlugsPublicados(): Promise<string[]> {
  return eventos.filter((e) => e.status === "publicado").map((e) => e.slug);
}

/** Evento publicado pelo slug (inclusive não listado ou com senha), ou `null`. */
export async function buscarEventoPublicado(slug: string): Promise<EventoResumo | null> {
  const evento = eventos.find((e) => e.slug === slug && e.status === "publicado");
  return evento ? resumir(evento, await situacaoParaVisitante(evento)) : null;
}

/**
 * Confere a senha de um evento publicado com senha. Evento inexistente ou sem senha leva o
 * mesmo tempo (compara com um hash falso), para a resposta não revelar nada.
 */
export async function conferirSenhaDoEvento(eventoId: string, senha: string): Promise<boolean> {
  const evento = eventos.find((e) => e.id === eventoId && e.status === "publicado");
  const hash = evento?.visibilidade === "senha" ? senhasEventos.get(evento.id) : undefined;
  const confere = senhaConfere(senha, hash ?? HASH_FALSO);
  return hash !== undefined && confere;
}

/** Libera o evento para o token do cookie (guardado só como hash) até `expiraEm`. */
export async function registrarAcessoAoEvento(
  tokenHash: string,
  eventoId: string,
  expiraEm: number,
) {
  const senhaHash = senhasEventos.get(eventoId);
  if (!senhaHash) return;
  acessosEvento.set(tokenHash, { eventoId, senhaHash, expiraEm });
}

/**
 * Filtros da galeria aberta. Cada um só vale se o fotógrafo ligou o recurso no evento;
 * senão é ignorado.
 */
export type FiltroGaleria = {
  /** Hora cheia da captura, AAAA-MM-DDTHH no horário de Brasília (`filtroHorario`). */
  hora?: string;
  /** Só itens em que o reconhecimento não achou rosto nem número (`listarNaoIdentificadas`). */
  naoIdentificadas?: boolean;
  /** Só os itens desta pasta do evento. */
  pasta?: string;
};

function idsIdentificados() {
  return new Set([...rostos.map((r) => r.fotoId), ...numeros.map((n) => n.fotoId)]);
}

function filtrarGaleria(itens: Foto[], evento: Evento, filtro: FiltroGaleria) {
  let resultado = itens;
  if (evento.filtroHorario && filtro.hora) {
    const hora = filtro.hora;
    resultado = resultado.filter((f) => f.capturadaEm && horaEmBrasilia(f.capturadaEm) === hora);
  }
  if (evento.listarNaoIdentificadas && filtro.naoIdentificadas) {
    const identificados = idsIdentificados();
    resultado = resultado.filter((f) => !identificados.has(f.id));
  }
  if (filtro.pasta) resultado = resultado.filter((f) => f.pastaId === filtro.pasta);
  return resultado;
}

export type OpcoesGaleria = {
  /** Horas com itens, em ordem; `null` quando o evento não tem o filtro por horário. */
  horas: { hora: string; total: number }[] | null;
  /** Quantos itens não identificados; `null` quando o evento não lista os não identificados. */
  naoIdentificadas: number | null;
  /** Pastas com itens visíveis, na ordem do fotógrafo. */
  pastas: { id: string; nome: string; total: number }[];
};

/** Opções de filtro da galeria aberta, para quem pode vê-la agora. */
export async function listarOpcoesGaleria(eventoId: string): Promise<OpcoesGaleria> {
  const evento = eventos.find((e) => e.id === eventoId && e.status === "publicado");
  if (!evento || (await situacaoParaVisitante(evento)).tipo !== "aberta") {
    return { horas: null, naoIdentificadas: null, pastas: [] };
  }
  const itens = itensVisiveisDoEvento(evento);
  let horas: OpcoesGaleria["horas"] = null;
  if (evento.filtroHorario) {
    const contagem = new Map<string, number>();
    for (const f of itens) {
      if (!f.capturadaEm) continue;
      const hora = horaEmBrasilia(f.capturadaEm);
      contagem.set(hora, (contagem.get(hora) ?? 0) + 1);
    }
    horas = [...contagem.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, total]) => ({ hora, total }));
  }
  return {
    horas,
    naoIdentificadas: evento.listarNaoIdentificadas
      ? filtrarGaleria(itens, evento, { naoIdentificadas: true }).length
      : null,
    pastas: pastas
      .filter((p) => p.eventoId === evento.id)
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        total: itens.filter((f) => f.pastaId === p.id).length,
      }))
      .filter((p) => p.total > 0),
  };
}

/**
 * Itens da galeria aberta de um evento, paginados por cursor (docs/riscos.md: galeria lenta).
 * Se a galeria não está aberta (aguardando liberação, com senha ou só após a busca), devolve
 * vazio. O cursor é o id do último item da página anterior.
 */
export async function listarFotosDoEvento(
  eventoId: string,
  {
    cursor,
    limite = 48,
    filtro = {},
  }: { cursor?: string | null; limite?: number; filtro?: FiltroGaleria } = {},
): Promise<PaginaDeFotos> {
  const evento = eventos.find((e) => e.id === eventoId && e.status === "publicado");
  if (!evento || (await situacaoParaVisitante(evento)).tipo !== "aberta") {
    return { fotos: [], proximoCursor: null };
  }
  const itens = filtrarGaleria(itensVisiveisDoEvento(evento), evento, filtro);
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

  const resumo = resumir(evento, await situacaoParaVisitante(evento));
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

// ---------------------------------------------------------------- Busca

/**
 * Evento publicado onde a busca vale: galeria aberta ou "só após a busca". Aguardando
 * liberação ou com senha (sem a senha aceita) não abrem nem pela busca.
 */
async function eventoBuscavel(eventoId: string) {
  const evento = eventos.find((e) => e.id === eventoId && e.status === "publicado");
  if (!evento) return null;
  const situacao = (await situacaoParaVisitante(evento)).tipo;
  return situacao === "aberta" || situacao === "so_apos_busca" ? evento : null;
}

/** Itens visíveis do evento entre os ids encontrados pela busca, na ordem da galeria. */
export async function fotosEncontradas(eventoId: string, fotoIds: string[]): Promise<Foto[]> {
  const evento = await eventoBuscavel(eventoId);
  if (!evento) return [];
  const alvo = new Set(fotoIds);
  return structuredClone(itensVisiveisDoEvento(evento).filter((f) => alvo.has(f.id)));
}

/** O evento tem números de peito reconhecidos? (Mostra a busca por número.) */
export async function eventoTemNumeros(eventoId: string): Promise<boolean> {
  const doEvento = new Set(fotos.filter((f) => f.eventoId === eventoId).map((f) => f.id));
  return numeros.some((n) => doEvento.has(n.fotoId));
}

/** Itens do evento em que o número de peito foi reconhecido. */
export async function fotosPorNumero(eventoId: string, numero: string): Promise<Foto[]> {
  const ids = numeros.filter((n) => n.numero === numero).map((n) => n.fotoId);
  return fotosEncontradas(eventoId, ids);
}

/**
 * Rostos de exemplo do evento agrupados por pessoa, para a busca facial simulada. Com o
 * provedor real, a busca vai direto à coleção do evento no provedor.
 */
export async function rostosDeExemploDoEvento(eventoId: string): Promise<string[][]> {
  const doEvento = new Set(fotos.filter((f) => f.eventoId === eventoId).map((f) => f.id));
  const porPessoa = new Map<string, string[]>();
  for (const r of rostos) {
    if (!doEvento.has(r.fotoId)) continue;
    porPessoa.set(r.rostoId, [...(porPessoa.get(r.rostoId) ?? []), r.fotoId]);
  }
  return [...porPessoa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, ids]) => ids);
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

// ---------------------------------------------------------------- Descontos

/**
 * Faixas de desconto progressivo e pacotes que podem valer para estes eventos: as faixas
 * próprias de cada evento, a regra padrão dos donos deles e os pacotes. Quem escolhe qual vale
 * é o cálculo (src/servicos/descontos.ts).
 */
export async function buscarRegrasDeDesconto(
  eventoIds: string[],
): Promise<{ faixas: FaixaDesconto[]; pacotes: Pacote[] }> {
  const alvo = new Set(eventoIds);
  const donos = new Set(eventos.filter((e) => alvo.has(e.id)).map((e) => e.fotografoId));
  return structuredClone({
    faixas: faixasDesconto.filter((f) =>
      f.eventoId === null ? donos.has(f.fotografoId) : alvo.has(f.eventoId),
    ),
    pacotes: pacotes.filter((p) => alvo.has(p.eventoId)),
  });
}

/** Cupom pelo código, sem diferenciar maiúsculas; `null` se não existe. */
export async function buscarCupomPorCodigo(codigo: string): Promise<Cupom | null> {
  const alvo = codigo.trim().toUpperCase();
  const cupom = cupons.find((c) => c.codigo.toUpperCase() === alvo);
  return cupom ? structuredClone(cupom) : null;
}

/**
 * Soma um uso ao cupom, só se ainda houver uso disponível, como um
 * `UPDATE cupons SET usos = usos + 1 WHERE id = … AND (usos_max IS NULL OR usos < usos_max)`.
 * Roda junto com a confirmação do pagamento (docs/riscos.md: cupom usado além do limite).
 */
export async function registrarUsoDoCupom(cupomId: string): Promise<boolean> {
  const cupom = cupons.find((c) => c.id === cupomId);
  if (!cupom || (cupom.usosMax !== null && cupom.usos >= cupom.usosMax)) return false;
  cupom.usos++;
  return true;
}

// ---------------------------------------------------------------- Pedidos

/**
 * Quem recebe por um item: o autor da foto e o dono do evento. A comissão da plataforma não
 * entra aqui: ela sai no saque de cada um.
 */
export type RegraDeDivisao = {
  fotoId: string;
  autorId: string;
  donoEventoId: string;
  /** Parte do dono sobre o preço, quando o autor é colaborador; 0 quando o autor é o dono. */
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

/**
 * Liga o pedido pendente à order criada no Mercado Pago, só se a order atual ainda for a
 * `anterior` (como um `UPDATE … WHERE gateway_id IS NOT DISTINCT FROM $anterior`). Na primeira
 * cobrança `anterior` é `null`; numa nova tentativa de cartão, é a order recusada. Devolve se
 * gravou; `false` quer dizer que outra requisição chegou antes.
 */
export async function ligarPedidoAoGateway(
  id: string,
  anterior: string | null,
  gatewayId: string,
  pix: PedidoInterno["pix"],
): Promise<boolean> {
  const pedido = pedidos.get(id);
  if (!pedido || pedido.status !== "pendente" || pedido.gatewayId !== anterior) return false;
  pedidos.set(id, { ...pedido, gatewayId, pix: structuredClone(pix) });
  return true;
}

/** Pedidos `pendente` cujo prazo de pagamento já passou (`pedidos(status, expira_em)`). */
export async function listarPendentesVencidos(instante: number): Promise<PedidoInterno[]> {
  return structuredClone(
    [...pedidos.values()].filter(
      (p) => p.status === "pendente" && new Date(p.expiraEm).getTime() < instante,
    ),
  );
}

/** Pedidos expirados que ainda não receberam o lembrete de carrinho abandonado. */
export async function listarExpiradosSemLembrete(): Promise<PedidoInterno[]> {
  return structuredClone(
    [...pedidos.values()].filter((p) => p.status === "expirado" && p.lembreteEnviadoEm === null),
  );
}

/**
 * Marca o lembrete como enviado, só se ainda não estava (`… WHERE lembrete_enviado_em IS
 * NULL`): dois jobs ao mesmo tempo não mandam o lembrete duas vezes. Devolve se marcou.
 */
export async function marcarLembreteEnviado(pedidoId: string): Promise<boolean> {
  const pedido = pedidos.get(pedidoId);
  if (!pedido || pedido.lembreteEnviadoEm !== null) return false;
  pedido.lembreteEnviadoEm = new Date().toISOString();
  return true;
}

export async function registrarMensagem(mensagem: Omit<Mensagem, "id" | "criadoEm">) {
  mensagens.push({
    ...structuredClone(mensagem),
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
  });
}

/** Mensagens enviadas, da mais recente para a mais antiga (painel de gestão). */
export async function listarMensagens(limite = 100): Promise<Mensagem[]> {
  return structuredClone(mensagens.slice(-limite).reverse());
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

// ---------------------------------------------------------------- Downloads

/** Item de pedido com o pedido a que pertence, ou `null`. */
export async function buscarItemDoPedido(
  itemId: string,
): Promise<{ item: ItemPedido; pedido: PedidoInterno } | null> {
  for (const [pedidoId, itens] of itensPorPedido) {
    const item = itens.find((i) => i.id === itemId);
    const pedido = item && pedidos.get(pedidoId);
    if (item && pedido) return { item: structuredClone(item), pedido: structuredClone(pedido) };
  }
  return null;
}

export type OriginalParaDownload = {
  /** Endereço temporário do original. */
  url: string;
  /** Nome com que o arquivo é salvo: evento + nome original, ex. corrida-x-IMG_4000.jpg. */
  nomeArquivo: string;
};

/**
 * Original de um item. Hoje, a imagem de exemplo sem marca d'água; na Fase 12, uma URL
 * assinada do R2 válida por 15 minutos, já com Content-Disposition de anexo e este nome.
 * Vale também para item excluído depois da venda: quem comprou continua baixando
 * (docs/arquitetura.md, exclusão lógica).
 */
export async function buscarOriginal(fotoId: string): Promise<OriginalParaDownload | null> {
  const foto = fotos.find((f) => f.id === fotoId);
  const evento = foto && eventos.find((e) => e.id === foto.eventoId);
  if (!foto || !evento) return null;
  return { url: urlOriginalDeExemplo(foto), nomeArquivo: `${evento.slug}-${foto.nomeArquivo}` };
}

export async function registrarDownload(itemPedidoId: string, ip: string | null) {
  downloads.push({
    id: crypto.randomUUID(),
    itemPedidoId,
    baixadoEm: new Date().toISOString(),
    ip,
  });
}

export async function contarDownloads(itemPedidoIds: string[]) {
  const ids = new Set(itemPedidoIds);
  const contagem = new Map<string, number>();
  for (const d of downloads) {
    if (ids.has(d.itemPedidoId))
      contagem.set(d.itemPedidoId, (contagem.get(d.itemPedidoId) ?? 0) + 1);
  }
  return contagem;
}

// ---------------------------------------------------------------- Usuários e sessões

function usuarioPublico(u: UsuarioInterno): Usuario {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    telefone: u.telefone,
    papel: u.papel,
    emailConfirmado: u.emailConfirmadoEm !== null,
    temGoogle: u.googleId !== null,
    criadoEm: u.criadoEm,
  };
}

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Usuário com o hash da senha, só para o login conferir. Nunca entregar às telas. */
export async function buscarUsuarioParaLogin(email: string): Promise<UsuarioInterno | null> {
  const alvo = normalizarEmail(email);
  for (const u of usuarios.values()) if (u.email === alvo) return structuredClone(u);
  return null;
}

export async function buscarUsuario(id: string): Promise<Usuario | null> {
  const u = usuarios.get(id);
  return u ? usuarioPublico(u) : null;
}

export async function emailEmUso(email: string) {
  return (await buscarUsuarioParaLogin(email)) !== null;
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  senhaHash: string | null;
  papel: Papel;
  googleId?: string;
  /** O Google já confirmou o e-mail; no cadastro com senha, o link de confirmação confirma. */
  emailConfirmado?: boolean;
}): Promise<Usuario> {
  const agora = new Date().toISOString();
  const usuario: UsuarioInterno = {
    id: crypto.randomUUID(),
    nome: dados.nome,
    email: normalizarEmail(dados.email),
    telefone: null,
    papel: dados.papel,
    senhaHash: dados.senhaHash,
    googleId: dados.googleId ?? null,
    emailConfirmadoEm: dados.emailConfirmado ? agora : null,
    criadoEm: agora,
  };
  usuarios.set(usuario.id, usuario);
  return usuarioPublico(usuario);
}

/** Usuário ligado a esta conta Google, ou `null`. */
export async function buscarUsuarioPorGoogle(googleId: string): Promise<Usuario | null> {
  for (const u of usuarios.values()) if (u.googleId === googleId) return usuarioPublico(u);
  return null;
}

/**
 * Liga a conta Google a um usuário que já existia com o mesmo e-mail, e marca o e-mail como
 * confirmado (o Google confirmou). Só se o usuário ainda não tiver outra conta Google.
 */
export async function ligarContaGoogle(usuarioId: string, googleId: string): Promise<boolean> {
  const u = usuarios.get(usuarioId);
  if (!u || (u.googleId !== null && u.googleId !== googleId)) return false;
  if (u.emailConfirmadoEm === null) {
    // Conta criada com senha e nunca confirmada: pode ter sido criada por outra pessoa com este
    // e-mail, esperando a dona dele entrar com o Google. A senha cai, e com ela as sessões
    // abertas: a versão da sessão (versaoDaSessao) muda junto.
    u.senhaHash = null;
  }
  u.googleId = googleId;
  u.emailConfirmadoEm ??= new Date().toISOString();
  return true;
}

/** Muda o papel de um usuário (painel de gestão). */
export async function mudarPapelDoUsuario(usuarioId: string, papel: Papel): Promise<boolean> {
  const u = usuarios.get(usuarioId);
  if (!u) return false;
  u.papel = papel;
  return true;
}

/**
 * Versão da sessão do usuário: muda quando a senha cai ou a conta Google muda (ver
 * ligarContaGoogle). O cookie de sessão leva esta versão, e um cookie com versão antiga deixa de
 * valer. Não usa o hash da senha em si: nas contas de exemplo ele é gerado com sal aleatório a
 * cada início do servidor, e cada instância da Vercel teria uma versão diferente. Quando houver
 * troca de senha (Fase 11), ela também precisa mudar a versão. `null` se o usuário não existe.
 */
export async function versaoDaSessao(usuarioId: string): Promise<string | null> {
  const u = usuarios.get(usuarioId);
  if (!u) return null;
  return createHash("sha256")
    .update(`${u.senhaHash ? "com-senha" : "sem-senha"}|${u.googleId ?? ""}`)
    .digest("base64url")
    .slice(0, 16);
}

export async function salvarConfirmacaoEmail(
  tokenHash: string,
  usuarioId: string,
  expiraEm: number,
) {
  confirmacoes.set(tokenHash, { usuarioId, expiraEm });
}

/** Usa o token de confirmação (uma vez só) e devolve o usuário, ou `null` se inválido/vencido. */
export async function consumirConfirmacaoEmail(tokenHash: string): Promise<string | null> {
  const confirmacao = confirmacoes.get(tokenHash);
  confirmacoes.delete(tokenHash);
  if (!confirmacao || confirmacao.expiraEm < Date.now()) return null;
  return confirmacao.usuarioId;
}

export async function marcarEmailConfirmado(usuarioId: string) {
  const u = usuarios.get(usuarioId);
  if (u && !u.emailConfirmadoEm) u.emailConfirmadoEm = new Date().toISOString();
}

/**
 * Liga à conta os pedidos feitos como convidado com o mesmo e-mail. Só chamar depois de o
 * e-mail estar confirmado, senão quem criasse conta com o e-mail de outra pessoa veria as
 * compras dela. Devolve quantos pedidos foram vinculados.
 */
export async function vincularPedidosDeConvidado(usuarioId: string): Promise<number> {
  const u = usuarios.get(usuarioId);
  if (!u?.emailConfirmadoEm) return 0;
  let vinculados = 0;
  for (const pedido of pedidos.values()) {
    if (pedido.clienteId === null && normalizarEmail(pedido.emailComprador) === u.email) {
      pedido.clienteId = u.id;
      vinculados++;
    }
  }
  return vinculados;
}

/** Pedidos de um cliente, do mais recente para o mais antigo. */
export async function listarPedidosDoCliente(
  clienteId: string,
): Promise<{ pedido: PedidoInterno; itens: ItemPedido[] }[]> {
  return [...pedidos.values()]
    .filter((p) => p.clienteId === clienteId)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map((p) => ({
      pedido: structuredClone(p),
      itens: structuredClone(itensPorPedido.get(p.id) ?? []),
    }));
}

// ---------------------------------------------------------------- Conta do fotógrafo

/** Dados privados do fotógrafo dono desta conta de usuário. Só para o próprio fotógrafo. */
export async function buscarContaDoFotografo(usuarioId: string): Promise<FotografoConta | null> {
  const conta = fotografos.find((f) => f.usuarioId === usuarioId);
  return conta ? structuredClone(conta) : null;
}

export async function slugDeFotografoEmUso(slug: string, excetoId?: string) {
  return fotografos.some((f) => f.slug === slug && f.id !== excetoId);
}

export async function criarContaDeFotografo(dados: {
  usuarioId: string;
  nomePublico: string;
  slug: string;
}): Promise<FotografoConta> {
  const conta: FotografoConta = {
    id: crypto.randomUUID(),
    usuarioId: dados.usuarioId,
    nomePublico: dados.nomePublico,
    slug: dados.slug,
    bio: null,
    fotoPerfil: null,
    capa: null,
    redesSociais: {},
    cpfCnpj: "",
    chavePix: null,
    comissaoPct: 10,
  };
  fotografos.push(conta);
  return structuredClone(conta);
}

export type AlteracoesPerfil = Partial<
  Pick<FotografoConta, "nomePublico" | "slug" | "bio" | "redesSociais" | "cpfCnpj" | "chavePix">
>;

/** Atualiza só a conta ligada a este usuário: nunca por um id vindo do navegador. */
export async function atualizarContaDoFotografo(usuarioId: string, alteracoes: AlteracoesPerfil) {
  const conta = fotografos.find((f) => f.usuarioId === usuarioId);
  if (!conta) return null;
  Object.assign(conta, alteracoes);
  return structuredClone(conta);
}
export * from "./painel";
export * from "./admin";
export * from "./vendas-painel";
export * from "./loja-moderacao";
