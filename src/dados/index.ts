// Camada de dados do app. As telas só importam daqui, nunca do banco direto. Desde a Fase 11
// lê e grava no Postgres (src/db): Supabase na Vercel, PGlite em memória no desenvolvimento local e
// nos testes. As assinaturas são as mesmas da implementação de exemplo que veio antes.
//
// As regras de quem vê o quê ficam aqui, e não nas telas, para valerem em qualquer caminho
// (página, Server Action, link direto para uma foto).

import "server-only";

import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { cookieDoEvento, hashDoToken } from "@/lib/acesso-evento";
import { HASH_FALSO, senhaConfere } from "@/lib/senha";
import { urlPublica } from "@/lib/url-publica";

import { eventosDosCupons } from "./comum";
import {
  deIso,
  iso,
  paraCupom,
  paraEvento,
  paraFaixa,
  paraFoto,
  paraFotografo,
  paraItem,
  paraMensagem,
  paraPacote,
  paraPedido,
  paraUsuario,
} from "./mapas";
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
 * não deixa ler o relógio durante a pré-renderização.
 */
async function agora() {
  await connection();
  return Date.now();
}

/** Item que pode aparecer para o público: pronto e não excluído. */
const itemVisivel = and(eq(t.fotos.status, "pronta"), isNull(t.fotos.excluidaEm));

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
  const banco = await obterBanco();
  const [acesso] = await banco
    .select({ expiraEm: t.acessosEvento.expiraEm, senhaAceita: t.acessosEvento.senhaHash })
    .from(t.acessosEvento)
    .innerJoin(t.eventos, eq(t.eventos.id, t.acessosEvento.eventoId))
    .where(
      and(
        eq(t.acessosEvento.tokenHash, hashDoToken(token)),
        eq(t.acessosEvento.eventoId, evento.id),
        eq(t.acessosEvento.senhaHash, t.eventos.senhaHash),
      ),
    );
  return acesso !== undefined && acesso.expiraEm.getTime() > Date.now();
}

/** Situação da galeria para quem está fazendo esta requisição (lê o cookie da senha). */
async function situacaoParaVisitante(evento: Evento) {
  return situacaoGaleria(evento, await agora(), await acessoPorSenha(evento));
}

async function eventoPorId(eventoId: string, soPublicado = true): Promise<Evento | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.eventos)
    .where(
      soPublicado
        ? and(eq(t.eventos.id, eventoId), eq(t.eventos.status, "publicado"))
        : eq(t.eventos.id, eventoId),
    );
  return linha ? paraEvento(linha) : null;
}

/** Colunas que bastam para ordenar e filtrar a galeria, sem trazer o item inteiro. */
type ChaveItem = Pick<
  Foto,
  "id" | "tipo" | "pastaId" | "nomeArquivo" | "criadoEm" | "capturadaEm"
> & { largura: number; altura: number; urlMiniatura: string };

/**
 * Itens visíveis do evento, na ordem da galeria, só com as colunas de ordenar e filtrar. A
 * ordem natural do nome do arquivo (IMG_2 antes de IMG_10) e a "aleatória" estável por evento
 * são feitas aqui; o item inteiro é buscado só para a página pedida.
 */
async function chavesVisiveisDoEvento(evento: Evento): Promise<ChaveItem[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      id: t.fotos.id,
      tipo: t.fotos.tipo,
      pastaId: t.fotos.pastaId,
      nomeArquivo: t.fotos.nomeArquivo,
      criadoEm: t.fotos.criadoEm,
      capturadaEm: t.fotos.capturadaEm,
      largura: t.fotos.largura,
      altura: t.fotos.altura,
      urlMiniatura: t.fotos.urlMiniatura,
    })
    .from(t.fotos)
    .where(and(eq(t.fotos.eventoId, evento.id), itemVisivel));
  const itens = linhas.map((l) => ({
    ...l,
    urlMiniatura: urlPublica(l.urlMiniatura),
    criadoEm: iso(l.criadoEm),
    capturadaEm: iso(l.capturadaEm),
  }));
  return ordenar(itens, evento);
}

/** Ordem da galeria, escolhida pelo fotógrafo. Sempre estável, para o cursor funcionar. */
function ordenar<T extends ChaveItem>(itens: T[], evento: Evento) {
  const desempate = (a: T, b: T) => a.id.localeCompare(b.id);
  const chave: Record<Evento["ordenacao"], (a: T, b: T) => number> = {
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

/** Fotos completas pelos ids, na ordem pedida. */
async function fotosPorIds(ids: string[]): Promise<Foto[]> {
  if (ids.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco.select().from(t.fotos).where(inArray(t.fotos.id, ids));
  const porId = new Map(linhas.map((l) => [l.id, paraFoto(l)]));
  return ids.flatMap((id) => porId.get(id) ?? []);
}

async function resumir(
  eventosLista: Evento[],
  situacoes: SituacaoGaleria[],
): Promise<EventoResumo[]> {
  if (eventosLista.length === 0) return [];
  const banco = await obterBanco();
  const [contas, cats, contagens] = await Promise.all([
    banco
      .select()
      .from(t.fotografos)
      .where(inArray(t.fotografos.id, [...new Set(eventosLista.map((e) => e.fotografoId))])),
    banco.select().from(t.categorias),
    banco
      .select({
        eventoId: t.fotos.eventoId,
        fotos: sql<number>`count(*) filter (where ${t.fotos.tipo} = 'foto')::int`,
        videos: sql<number>`count(*) filter (where ${t.fotos.tipo} = 'video')::int`,
      })
      .from(t.fotos)
      .where(
        and(
          inArray(
            t.fotos.eventoId,
            eventosLista.map((e) => e.id),
          ),
          itemVisivel,
        ),
      )
      .groupBy(t.fotos.eventoId),
  ]);
  return Promise.all(
    eventosLista.map(async (evento, i) => {
      const conta = contas.find((f) => f.id === evento.fotografoId);
      const categoria = cats.find((c) => c.id === evento.categoriaId);
      if (!conta || !categoria) {
        throw new Error(`Evento ${evento.id} com fotógrafo ou categoria inválidos`);
      }
      const situacao = situacoes[i];
      const contagem = contagens.find((c) => c.eventoId === evento.id);
      // A capa só usa uma foto do evento se a galeria estiver aberta; senão mostraria o que não deve.
      const capa =
        situacao.tipo === "aberta" ? (await chavesVisiveisDoEvento(evento))[0] : undefined;
      return {
        ...evento,
        fotografo: perfilPublico(paraFotografo(conta)),
        categoria,
        totalItens: (contagem?.fotos ?? 0) + (contagem?.videos ?? 0),
        totalFotos: contagem?.fotos ?? 0,
        totalVideos: contagem?.videos ?? 0,
        capaMiniatura: capa
          ? { urlMiniatura: capa.urlMiniatura, largura: capa.largura, altura: capa.altura }
          : null,
        situacaoGaleria: situacao,
      };
    }),
  );
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

const eventoListado = and(
  eq(t.eventos.status, "publicado"),
  eq(t.eventos.listado, true),
  ne(t.eventos.visibilidade, "nao_listado"),
);

async function eventosListados(): Promise<Evento[]> {
  const banco = await obterBanco();
  return (await banco.select().from(t.eventos).where(eventoListado)).map(paraEvento);
}

/**
 * Eventos que aparecem na lista pública, do mais recente para o mais antigo: publicados e
 * listados. Eventos não listados só abrem pelo link.
 */
export async function listarEventosPublicados(filtro: FiltroEventos = {}): Promise<EventoResumo[]> {
  const instante = await agora();
  const termo = filtro.busca ? normalizar(filtro.busca.trim()) : "";
  const cidade = filtro.cidade ? normalizar(filtro.cidade) : null;
  const banco = await obterBanco();
  const categoriaId = filtro.categoria
    ? ((
        await banco
          .select({ id: t.categorias.id })
          .from(t.categorias)
          .where(eq(t.categorias.slug, filtro.categoria))
      )[0]?.id ?? null)
    : undefined;
  if (categoriaId === null) return [];

  const escolhidos = (await eventosListados())
    .filter((e) => !filtro.data || diaEmBrasilia(e.inicioEm) === filtro.data)
    .filter((e) => !categoriaId || e.categoriaId === categoriaId)
    .filter((e) => !cidade || normalizar(e.cidade) === cidade)
    .filter((e) => !filtro.fotografoId || e.fotografoId === filtro.fotografoId);
  const resumos = await resumir(
    escolhidos,
    escolhidos.map((e) => situacaoGaleria(e, instante)),
  );
  return resumos
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
  const banco = await obterBanco();
  const listados = await eventosListados();
  const categoriaIds = new Set(listados.map((e) => e.categoriaId));
  const cidades = new Map(listados.map((e) => [normalizar(e.cidade), e]));
  const cats = await banco.select().from(t.categorias);
  return {
    categorias: cats
      .filter((c) => categoriaIds.has(c.id))
      .map((c) => ({ slug: c.slug, nome: c.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    cidades: [...cidades.values()]
      .map((e) => ({ nome: e.cidade, estado: e.estado }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** Evento publicado pelo slug (inclusive não listado ou com senha), ou `null`. */
export async function buscarEventoPublicado(slug: string): Promise<EventoResumo | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.slug, slug), eq(t.eventos.status, "publicado")));
  if (!linha) return null;
  const evento = paraEvento(linha);
  const [resumo] = await resumir([evento], [await situacaoParaVisitante(evento)]);
  return resumo;
}

/**
 * Confere a senha de um evento publicado com senha. Evento inexistente ou sem senha leva o
 * mesmo tempo (compara com um hash falso), para a resposta não revelar nada.
 */
export async function conferirSenhaDoEvento(eventoId: string, senha: string): Promise<boolean> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ visibilidade: t.eventos.visibilidade, senhaHash: t.eventos.senhaHash })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.status, "publicado")));
  const hash = linha?.visibilidade === "senha" ? linha.senhaHash : null;
  const confere = senhaConfere(senha, hash ?? HASH_FALSO);
  return hash !== null && confere;
}

/** Libera o evento para o token do cookie (guardado só como hash) até `expiraEm`. */
export async function registrarAcessoAoEvento(
  tokenHash: string,
  eventoId: string,
  expiraEm: number,
) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ senhaHash: t.eventos.senhaHash })
    .from(t.eventos)
    .where(eq(t.eventos.id, eventoId));
  if (!linha?.senhaHash) return;
  await banco
    .insert(t.acessosEvento)
    .values({ tokenHash, eventoId, senhaHash: linha.senhaHash, expiraEm: new Date(expiraEm) })
    .onConflictDoNothing();
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

/** Itens do evento em que o reconhecimento achou rosto ou número. */
async function idsIdentificados(eventoId: string) {
  const banco = await obterBanco();
  const [comRosto, comNumero] = await Promise.all([
    banco
      .selectDistinct({ fotoId: t.rostos.fotoId })
      .from(t.rostos)
      .innerJoin(t.fotos, eq(t.fotos.id, t.rostos.fotoId))
      .where(eq(t.fotos.eventoId, eventoId)),
    banco
      .selectDistinct({ fotoId: t.numeros.fotoId })
      .from(t.numeros)
      .innerJoin(t.fotos, eq(t.fotos.id, t.numeros.fotoId))
      .where(eq(t.fotos.eventoId, eventoId)),
  ]);
  return new Set([...comRosto, ...comNumero].map((l) => l.fotoId));
}

async function filtrarGaleria<T extends ChaveItem>(
  itens: T[],
  evento: Evento,
  filtro: FiltroGaleria,
) {
  let resultado = itens;
  if (evento.filtroHorario && filtro.hora) {
    const hora = filtro.hora;
    resultado = resultado.filter((f) => f.capturadaEm && horaEmBrasilia(f.capturadaEm) === hora);
  }
  if (evento.listarNaoIdentificadas && filtro.naoIdentificadas) {
    const identificados = await idsIdentificados(evento.id);
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
  const evento = await eventoPorId(eventoId);
  if (!evento || (await situacaoParaVisitante(evento)).tipo !== "aberta") {
    return { horas: null, naoIdentificadas: null, pastas: [] };
  }
  const banco = await obterBanco();
  const itens = await chavesVisiveisDoEvento(evento);
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
  const pastas = await banco
    .select()
    .from(t.pastas)
    .where(eq(t.pastas.eventoId, evento.id))
    .orderBy(asc(t.pastas.ordem));
  return {
    horas,
    naoIdentificadas: evento.listarNaoIdentificadas
      ? (await filtrarGaleria(itens, evento, { naoIdentificadas: true })).length
      : null,
    pastas: pastas
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
  const evento = await eventoPorId(eventoId);
  if (!evento || (await situacaoParaVisitante(evento)).tipo !== "aberta") {
    return { fotos: [], proximoCursor: null };
  }
  const itens = await filtrarGaleria(await chavesVisiveisDoEvento(evento), evento, filtro);
  // Cursor desconhecido dá findIndex -1, então começa do início em vez de dar página vazia.
  const inicio = cursor ? itens.findIndex((f) => f.id === cursor) + 1 : 0;
  const pagina = itens.slice(inicio, inicio + limite);
  const ultima = pagina.at(-1);
  const temMais = ultima !== undefined && itens.at(-1)?.id !== ultima.id;
  return {
    fotos: await fotosPorIds(pagina.map((f) => f.id)),
    proximoCursor: temMais ? ultima.id : null,
  };
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

export function precoDoItem(foto: Pick<Foto, "precoCentavos" | "tipo">, evento: Evento) {
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
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.fotos)
    .where(and(eq(t.fotos.id, fotoId), itemVisivel));
  if (!linha) return null;
  const foto = paraFoto(linha);
  const evento = await eventoPorId(foto.eventoId);
  if (!evento) return null;

  const [resumo] = await resumir([evento], [await situacaoParaVisitante(evento)]);
  const situacao = resumo.situacaoGaleria.tipo;
  if (situacao === "aguardando_liberacao" || situacao === "senha") return null;

  const base = { foto, evento: resumo, precoCentavos: precoDoItem(foto, evento) };
  if (situacao === "so_apos_busca") {
    return { ...base, posicao: null, anteriorId: null, proximaId: null };
  }
  const itens = await chavesVisiveisDoEvento(evento);
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
  const evento = await eventoPorId(eventoId);
  if (!evento) return null;
  const situacao = (await situacaoParaVisitante(evento)).tipo;
  return situacao === "aberta" || situacao === "so_apos_busca" ? evento : null;
}

/** Itens visíveis do evento entre os ids encontrados pela busca, na ordem da galeria. */
export async function fotosEncontradas(eventoId: string, fotoIds: string[]): Promise<Foto[]> {
  const evento = await eventoBuscavel(eventoId);
  if (!evento) return [];
  const alvo = new Set(fotoIds);
  const ids = (await chavesVisiveisDoEvento(evento)).filter((f) => alvo.has(f.id)).map((f) => f.id);
  return fotosPorIds(ids);
}

/** O evento tem números de peito reconhecidos? (Mostra a busca por número.) */
export async function eventoTemNumeros(eventoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.numeros.id })
    .from(t.numeros)
    .innerJoin(t.fotos, eq(t.fotos.id, t.numeros.fotoId))
    .where(eq(t.fotos.eventoId, eventoId))
    .limit(1);
  return linha !== undefined;
}

/** Itens do evento em que o número de peito foi reconhecido. */
export async function fotosPorNumero(eventoId: string, numero: string): Promise<Foto[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .selectDistinct({ fotoId: t.numeros.fotoId })
    .from(t.numeros)
    .innerJoin(t.fotos, eq(t.fotos.id, t.numeros.fotoId))
    .where(and(eq(t.numeros.numero, numero), eq(t.fotos.eventoId, eventoId)));
  return fotosEncontradas(
    eventoId,
    linhas.map((l) => l.fotoId),
  );
}

/**
 * Rostos de exemplo do evento agrupados por pessoa, para a busca facial simulada. Com o
 * provedor real, a busca vai direto à coleção do evento no provedor.
 */
export async function rostosDeExemploDoEvento(eventoId: string): Promise<string[][]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ fotoId: t.rostos.fotoId, rosto: t.rostos.rostoIdProvedor })
    .from(t.rostos)
    .innerJoin(t.fotos, eq(t.fotos.id, t.rostos.fotoId))
    .where(eq(t.fotos.eventoId, eventoId));
  const porPessoa = new Map<string, string[]>();
  for (const r of linhas) porPessoa.set(r.rosto, [...(porPessoa.get(r.rosto) ?? []), r.fotoId]);
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
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return [];
  const instante = await agora();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ foto: t.fotos, evento: t.eventos })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(and(inArray(t.fotos.id, unicos), itemVisivel, eq(t.eventos.status, "publicado")));
  return linhas.flatMap((l) => {
    const foto = paraFoto(l.foto);
    const evento = paraEvento(l.evento);
    if (situacaoGaleria(evento, instante).tipo === "aguardando_liberacao") return [];
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
): Promise<{ faixas: FaixaDesconto[]; pacotes: Pacote[]; semProgressivo: string[] }> {
  if (eventoIds.length === 0) return { faixas: [], pacotes: [], semProgressivo: [] };
  const banco = await obterBanco();
  const eventos = await banco
    .select({
      id: t.eventos.id,
      dono: t.eventos.fotografoId,
      progressivo: t.eventos.descontoProgressivo,
    })
    .from(t.eventos)
    .where(inArray(t.eventos.id, eventoIds));
  const donos = eventos.map((e) => e.dono);
  const [faixas, pacotes] = await Promise.all([
    banco
      .select()
      .from(t.faixasDesconto)
      .where(
        or(
          inArray(t.faixasDesconto.eventoId, eventoIds),
          and(isNull(t.faixasDesconto.eventoId), inArray(t.faixasDesconto.fotografoId, donos)),
        ),
      ),
    banco.select().from(t.pacotes).where(inArray(t.pacotes.eventoId, eventoIds)),
  ]);
  return {
    faixas: faixas.map(paraFaixa),
    pacotes: pacotes.map(paraPacote),
    // Eventos em que o fotógrafo desligou o desconto progressivo.
    semProgressivo: eventos.filter((e) => !e.progressivo).map((e) => e.id),
  };
}

/** Cupom pelo código, sem diferenciar maiúsculas; `null` se não existe. */
export async function buscarCupomPorCodigo(codigo: string): Promise<Cupom | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.cupons)
    .where(eq(sql`upper(${t.cupons.codigo})`, codigo.trim().toUpperCase()));
  if (!linha) return null;
  return paraCupom(linha, (await eventosDosCupons([linha.id])).get(linha.id) ?? []);
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
  if (fotoIds.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      fotoId: t.fotos.id,
      autorId: t.fotos.enviadaPor,
      donoEventoId: t.eventos.fotografoId,
      comissao: t.colaboradores.comissaoDonoPct,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .leftJoin(
      t.colaboradores,
      and(
        eq(t.colaboradores.eventoId, t.fotos.eventoId),
        eq(t.colaboradores.fotografoId, t.fotos.enviadaPor),
      ),
    )
    .where(inArray(t.fotos.id, fotoIds));
  return fotoIds.flatMap((fotoId) => {
    const l = linhas.find((x) => x.fotoId === fotoId);
    if (!l) return [];
    return [
      {
        fotoId,
        autorId: l.autorId,
        donoEventoId: l.donoEventoId,
        comissaoDonoPct: l.autorId === l.donoEventoId ? 0 : (l.comissao ?? 0),
      },
    ];
  });
}

function linhaDoPedido(p: PedidoInterno): typeof t.pedidos.$inferInsert {
  // Reembolso, contestação e estorno nunca nascem com o pedido: só as funções de estorno gravam.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { pix, reembolsoSolicitadoEm, contestadoEm, estornadoEm, motivoEstorno, ...resto } = p;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return {
    ...resto,
    acessoExpiraEm: deIso(p.acessoExpiraEm),
    expiraEm: deIso(p.expiraEm),
    pagoEm: deIso(p.pagoEm),
    lembreteEnviadoEm: deIso(p.lembreteEnviadoEm),
    criadoEm: deIso(p.criadoEm),
    pixCopiaECola: pix?.copiaECola ?? null,
    pixQrCodeBase64: pix?.qrCodeBase64 ?? null,
  };
}

/** Grava o pedido e os itens juntos: ou os dois, ou nenhum. */
export async function salvarPedido(pedido: PedidoInterno, itens: ItemPedido[]) {
  const banco = await obterBanco();
  await banco.transaction(async (tx) => {
    await tx.insert(t.pedidos).values(linhaDoPedido(pedido));
    if (itens.length > 0) await tx.insert(t.itensPedido).values(itens);
  });
}

export async function buscarPedido(
  id: string,
): Promise<{ pedido: PedidoInterno; itens: ItemPedido[] } | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.pedidos).where(eq(t.pedidos.id, id));
  if (!linha) return null;
  const itens = await banco.select().from(t.itensPedido).where(eq(t.itensPedido.pedidoId, id));
  return { pedido: paraPedido(linha), itens: itens.map(paraItem) };
}

/**
 * Muda o status só se o pedido ainda estiver no status esperado
 * (`UPDATE pedidos SET status = … WHERE id = … AND status = …`). Devolve se mudou. É o que
 * deixa o webhook idempotente (docs/riscos.md, prioridade alta).
 */
export async function mudarStatusPedido(
  id: string,
  de: StatusPedido,
  para: StatusPedido,
  extra: Partial<Pick<PedidoInterno, "pagoEm" | "gatewayId">> = {},
): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.pedidos)
    .set({
      status: para,
      ...("pagoEm" in extra ? { pagoEm: deIso(extra.pagoEm ?? null) } : {}),
      ...("gatewayId" in extra ? { gatewayId: extra.gatewayId } : {}),
    })
    .where(and(eq(t.pedidos.id, id), eq(t.pedidos.status, de)))
    .returning({ id: t.pedidos.id });
  return atualizados.length > 0;
}

export type ResultadoPedidoPago =
  | { mudou: false }
  | {
      mudou: true;
      /** O pedido tinha cupom e ele já estava sem uso disponível (limite estourou). */
      cupomEsgotado: boolean;
    };

/**
 * Marca o pedido como `pago` e soma o uso do cupom na MESMA transação. O `pendente → pago` é
 * a trava: só a primeira confirmação passa por ele e soma o uso, então repetir o webhook não
 * soma de novo. O uso só é somado com `usos < usos_max` na condição do UPDATE; no Postgres, o
 * UPDATE de um cupom disputado espera o outro e confere a condição de novo, então dois pedidos
 * ao mesmo tempo nunca passam do limite.
 *
 * Se o limite estourou entre a criação do pedido e o pagamento, o pedido continua pago (o
 * cliente já pagou com o desconto) e a chamada devolve `cupomEsgotado` para registrar o caso;
 * não há estorno automático (docs/arquitetura.md, "Descontos").
 */
export async function marcarPedidoPago(id: string, pagoEm: string): Promise<ResultadoPedidoPago> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const [pedido] = await tx
      .update(t.pedidos)
      .set({ status: "pago", pagoEm: new Date(pagoEm) })
      .where(and(eq(t.pedidos.id, id), eq(t.pedidos.status, "pendente")))
      .returning({ cupomId: t.pedidos.cupomId });
    if (!pedido) return { mudou: false };
    if (!pedido.cupomId) return { mudou: true, cupomEsgotado: false };
    const usados = await tx
      .update(t.cupons)
      .set({ usos: sql`${t.cupons.usos} + 1` })
      .where(
        and(
          eq(t.cupons.id, pedido.cupomId),
          or(isNull(t.cupons.usosMax), lt(t.cupons.usos, t.cupons.usosMax)),
        ),
      )
      .returning({ id: t.cupons.id });
    return { mudou: true, cupomEsgotado: usados.length === 0 };
  });
}

/**
 * Liga o pedido pendente à order criada no Mercado Pago, só se a order atual ainda for a
 * `anterior` (`… WHERE gateway_id IS NOT DISTINCT FROM $anterior`). Na primeira cobrança
 * `anterior` é `null`; numa nova tentativa de cartão, é a order recusada. Devolve se gravou;
 * `false` quer dizer que outra requisição chegou antes.
 */
export async function ligarPedidoAoGateway(
  id: string,
  anterior: string | null,
  gatewayId: string,
  pix: PedidoInterno["pix"],
): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.pedidos)
    .set({
      gatewayId,
      pixCopiaECola: pix?.copiaECola ?? null,
      pixQrCodeBase64: pix?.qrCodeBase64 ?? null,
    })
    .where(
      and(
        eq(t.pedidos.id, id),
        eq(t.pedidos.status, "pendente"),
        anterior === null ? isNull(t.pedidos.gatewayId) : eq(t.pedidos.gatewayId, anterior),
      ),
    )
    .returning({ id: t.pedidos.id });
  return atualizados.length > 0;
}

/** Pedidos `pendente` cujo prazo de pagamento já passou (`pedidos(status, expira_em)`). */
export async function listarPendentesVencidos(instante: number): Promise<PedidoInterno[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.pedidos)
    .where(and(eq(t.pedidos.status, "pendente"), lt(t.pedidos.expiraEm, new Date(instante))));
  return linhas.map(paraPedido);
}

/** Pedidos expirados que ainda não receberam o lembrete de carrinho abandonado. */
export async function listarExpiradosSemLembrete(): Promise<PedidoInterno[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.pedidos)
    .where(and(eq(t.pedidos.status, "expirado"), isNull(t.pedidos.lembreteEnviadoEm)));
  return linhas.map(paraPedido);
}

/**
 * Marca o lembrete como enviado, só se ainda não estava (`… WHERE lembrete_enviado_em IS
 * NULL`): dois jobs ao mesmo tempo não mandam o lembrete duas vezes. Devolve se marcou.
 */
export async function marcarLembreteEnviado(pedidoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.pedidos)
    .set({ lembreteEnviadoEm: new Date() })
    .where(and(eq(t.pedidos.id, pedidoId), isNull(t.pedidos.lembreteEnviadoEm)))
    .returning({ id: t.pedidos.id });
  return atualizados.length > 0;
}

export async function registrarMensagem(mensagem: Omit<Mensagem, "id" | "criadoEm">) {
  const banco = await obterBanco();
  await banco.insert(t.mensagens).values(mensagem);
}

/** Mensagens enviadas, da mais recente para a mais antiga (painel de gestão). */
export async function listarMensagens(limite = 100): Promise<Mensagem[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.mensagens)
    .orderBy(desc(t.mensagens.criadoEm))
    .limit(limite);
  return linhas.map(paraMensagem);
}

export async function salvarLancamentos(novos: Lancamento[]) {
  if (novos.length === 0) return;
  const banco = await obterBanco();
  await banco.insert(t.lancamentos).values(
    novos.map((l) => ({
      ...l,
      disponivelEm: deIso(l.disponivelEm),
      antecipavelEm: deIso(l.antecipavelEm),
    })),
  );
}

/** Itens de um pedido com o que a tela de confirmação mostra. */
export async function detalharItensDoPedido(itens: ItemPedido[]) {
  if (itens.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      fotoId: t.fotos.id,
      tipo: t.fotos.tipo,
      urlMiniatura: t.fotos.urlMiniatura,
      eventoTitulo: t.eventos.titulo,
      eventoSlug: t.eventos.slug,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(
      inArray(
        t.fotos.id,
        itens.map((i) => i.fotoId),
      ),
    );
  return itens.flatMap((item) => {
    const l = linhas.find((x) => x.fotoId === item.fotoId);
    if (!l) return [];
    return [
      {
        item,
        tipo: l.tipo,
        urlMiniatura: urlPublica(l.urlMiniatura),
        eventoTitulo: l.eventoTitulo,
        eventoSlug: l.eventoSlug,
      },
    ];
  });
}

// ---------------------------------------------------------------- Downloads

/** Item de pedido com o pedido a que pertence, ou `null`. */
export async function buscarItemDoPedido(
  itemId: string,
): Promise<{ item: ItemPedido; pedido: PedidoInterno } | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ item: t.itensPedido, pedido: t.pedidos })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .where(eq(t.itensPedido.id, itemId));
  return linha ? { item: paraItem(linha.item), pedido: paraPedido(linha.pedido) } : null;
}

export type OriginalDoItem = {
  /**
   * Onde está o original: a chave no bucket privado do R2 (`originais/...`) ou, nos dados de
   * exemplo, a URL da imagem de exemplo. Só sai daqui para src/servicos/downloads.ts.
   */
  chave: string;
  /** Nome com que o arquivo é salvo: evento + nome original, ex. corrida-x-IMG_4000.jpg. */
  nomeArquivo: string;
};

/**
 * Original de um item, para o download (que gera a URL assinada do R2). Vale também para item
 * excluído depois da venda: quem comprou continua baixando (docs/arquitetura.md, exclusão lógica).
 */
export async function buscarOriginal(fotoId: string): Promise<OriginalDoItem | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({
      chave: t.fotos.chaveOriginal,
      nome: t.fotos.nomeArquivo,
      slug: t.eventos.slug,
    })
    .from(t.fotos)
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(eq(t.fotos.id, fotoId));
  if (!linha?.chave) return null;
  return { chave: linha.chave, nomeArquivo: `${linha.slug}-${linha.nome}` };
}

export async function registrarDownload(itemPedidoId: string, ip: string | null) {
  const banco = await obterBanco();
  await banco.insert(t.downloads).values({ itemPedidoId, ip });
}

export async function contarDownloads(itemPedidoIds: string[]) {
  const contagem = new Map<string, number>();
  if (itemPedidoIds.length === 0) return contagem;
  const banco = await obterBanco();
  const linhas = await banco
    .select({ item: t.downloads.itemPedidoId, total: sql<number>`count(*)::int` })
    .from(t.downloads)
    .where(inArray(t.downloads.itemPedidoId, itemPedidoIds))
    .groupBy(t.downloads.itemPedidoId);
  for (const l of linhas) contagem.set(l.item, l.total);
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
    mfaAtivo: Boolean(u.mfaAtivadoEm),
    criadoEm: u.criadoEm,
  };
}

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

async function usuarioPorId(id: string): Promise<UsuarioInterno | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.usuarios).where(eq(t.usuarios.id, id));
  return linha ? paraUsuario(linha) : null;
}

/** Usuário com o hash da senha, só para o login conferir. Nunca entregar às telas. */
export async function buscarUsuarioParaLogin(email: string): Promise<UsuarioInterno | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.usuarios)
    .where(eq(t.usuarios.email, normalizarEmail(email)));
  return linha ? paraUsuario(linha) : null;
}

export async function buscarUsuario(id: string): Promise<Usuario | null> {
  const u = await usuarioPorId(id);
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
  const banco = await obterBanco();
  const [linha] = await banco
    .insert(t.usuarios)
    .values({
      nome: dados.nome,
      email: normalizarEmail(dados.email),
      papel: dados.papel,
      senhaHash: dados.senhaHash,
      googleId: dados.googleId ?? null,
      emailConfirmadoEm: dados.emailConfirmado ? new Date() : null,
    })
    .returning();
  return usuarioPublico(paraUsuario(linha));
}

/** Usuário ligado a esta conta Google, ou `null`. */
export async function buscarUsuarioPorGoogle(googleId: string): Promise<Usuario | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.usuarios).where(eq(t.usuarios.googleId, googleId));
  return linha ? usuarioPublico(paraUsuario(linha)) : null;
}

/**
 * Liga a conta Google a um usuário que já existia com o mesmo e-mail, e marca o e-mail como
 * confirmado (o Google confirmou). Só se o usuário ainda não tiver outra conta Google.
 */
export async function ligarContaGoogle(usuarioId: string, googleId: string): Promise<boolean> {
  const u = await usuarioPorId(usuarioId);
  if (!u || (u.googleId !== null && u.googleId !== googleId)) return false;
  const banco = await obterBanco();
  await banco
    .update(t.usuarios)
    .set({
      googleId,
      emailConfirmadoEm: deIso(u.emailConfirmadoEm) ?? new Date(),
      // Conta criada com senha e nunca confirmada: pode ter sido criada por outra pessoa com este
      // e-mail, esperando a dona dele entrar com o Google. A senha cai, e com ela as sessões
      // abertas: a versão da sessão (versaoDaSessao) muda junto.
      ...(u.emailConfirmadoEm === null ? { senhaHash: null } : {}),
    })
    .where(eq(t.usuarios.id, usuarioId));
  return true;
}

/** Muda o papel de um usuário (painel de gestão). */
export async function mudarPapelDoUsuario(usuarioId: string, papel: Papel): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.usuarios)
    .set({ papel })
    .where(eq(t.usuarios.id, usuarioId))
    .returning({ id: t.usuarios.id });
  return atualizados.length > 0;
}

/**
 * Versão da sessão de um usuário. Muda quando a senha muda ou cai, quando a conta Google muda
 * (ver ligarContaGoogle) e quando `versao_sessao` sobe ("sair de todos os dispositivos", troca de
 * CPF/CNPJ). O cookie de sessão leva esta versão, e um cookie com versão antiga deixa de valer.
 * É um resumo (SHA-256 truncado) e não revela o hash da senha.
 */
function calcularVersaoDaSessao(u: UsuarioInterno) {
  return createHash("sha256")
    .update(`${u.senhaHash ?? "sem-senha"}|${u.googleId ?? ""}|${u.versaoSessao ?? 0}`)
    .digest("base64url")
    .slice(0, 22);
}

/** Versão atual da sessão do usuário, ou `null` se ele não existe ou excluiu a conta. */
export async function versaoDaSessao(usuarioId: string): Promise<string | null> {
  const u = await usuarioPorId(usuarioId);
  // Conta excluída: nenhum cookie vale mais, nem um assinado antes da exclusão.
  if (!u || u.excluidoEm) return null;
  return calcularVersaoDaSessao(u);
}

/**
 * Usuário de um cookie de sessão já com a assinatura conferida, ou `null` se a versão mudou, a
 * conta foi excluída ou a sessão foi encerrada ("Sair"). Uma consulta só por requisição: o
 * usuário e a lista de sessões encerradas vêm juntos (busca pela chave primária nas duas).
 */
export async function usuarioDaSessao(
  usuarioId: string,
  versao: string,
  jti: string,
): Promise<Usuario | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.usuarios)
    .where(
      and(
        eq(t.usuarios.id, usuarioId),
        isNull(t.usuarios.excluidoEm),
        sql`not exists (select 1 from ${t.sessoesRevogadas} where ${t.sessoesRevogadas.jti} = ${jti})`,
      ),
    );
  if (!linha) return null;
  const u = paraUsuario(linha);
  return calcularVersaoDaSessao(u) === versao ? usuarioPublico(u) : null;
}

/** Encerra uma sessão ("Sair"): o cookie com este id deixa de valer, mesmo copiado. */
export async function revogarSessao(jti: string, expiraEm: number) {
  const banco = await obterBanco();
  await banco
    .insert(t.sessoesRevogadas)
    .values({ jti, expiraEm: new Date(expiraEm) })
    .onConflictDoNothing();
}

/** Derruba todas as sessões do usuário, em todos os aparelhos (sobe `versao_sessao`). */
export async function encerrarTodasAsSessoes(usuarioId: string) {
  const banco = await obterBanco();
  await banco
    .update(t.usuarios)
    .set({ versaoSessao: sql`${t.usuarios.versaoSessao} + 1` })
    .where(eq(t.usuarios.id, usuarioId));
}

/** Apaga as sessões encerradas que já venceriam de qualquer jeito (job de pedidos). */
export async function apagarSessoesRevogadasVencidas(agora: number) {
  const banco = await obterBanco();
  await banco.delete(t.sessoesRevogadas).where(lt(t.sessoesRevogadas.expiraEm, new Date(agora)));
}

export async function salvarConfirmacaoEmail(
  tokenHash: string,
  usuarioId: string,
  expiraEm: number,
) {
  const banco = await obterBanco();
  await banco
    .insert(t.confirmacoesEmail)
    .values({ tokenHash, usuarioId, expiraEm: new Date(expiraEm) });
}

/** Usa o token de confirmação (uma vez só) e devolve o usuário, ou `null` se inválido/vencido. */
export async function consumirConfirmacaoEmail(tokenHash: string): Promise<string | null> {
  const banco = await obterBanco();
  const [apagado] = await banco
    .delete(t.confirmacoesEmail)
    .where(eq(t.confirmacoesEmail.tokenHash, tokenHash))
    .returning();
  if (!apagado || apagado.expiraEm.getTime() < Date.now()) return null;
  return apagado.usuarioId;
}

export async function marcarEmailConfirmado(usuarioId: string) {
  const banco = await obterBanco();
  await banco
    .update(t.usuarios)
    .set({ emailConfirmadoEm: new Date() })
    .where(and(eq(t.usuarios.id, usuarioId), isNull(t.usuarios.emailConfirmadoEm)));
}

/**
 * Liga à conta os pedidos feitos como convidado com o mesmo e-mail. Só chamar depois de o
 * e-mail estar confirmado, senão quem criasse conta com o e-mail de outra pessoa veria as
 * compras dela. Devolve quantos pedidos foram vinculados.
 */
export async function vincularPedidosDeConvidado(usuarioId: string): Promise<number> {
  const u = await usuarioPorId(usuarioId);
  if (!u?.emailConfirmadoEm) return 0;
  const banco = await obterBanco();
  const vinculados = await banco
    .update(t.pedidos)
    .set({ clienteId: u.id })
    .where(
      and(isNull(t.pedidos.clienteId), eq(sql`lower(trim(${t.pedidos.emailComprador}))`, u.email)),
    )
    .returning({ id: t.pedidos.id });
  return vinculados.length;
}

/** Pedidos de um cliente, do mais recente para o mais antigo. */
export async function listarPedidosDoCliente(
  clienteId: string,
): Promise<{ pedido: PedidoInterno; itens: ItemPedido[] }[]> {
  const banco = await obterBanco();
  const pedidos = await banco
    .select()
    .from(t.pedidos)
    .where(eq(t.pedidos.clienteId, clienteId))
    .orderBy(desc(t.pedidos.criadoEm));
  if (pedidos.length === 0) return [];
  const itens = await banco
    .select()
    .from(t.itensPedido)
    .where(
      inArray(
        t.itensPedido.pedidoId,
        pedidos.map((p) => p.id),
      ),
    );
  return pedidos.map((p) => ({
    pedido: paraPedido(p),
    itens: itens.filter((i) => i.pedidoId === p.id).map(paraItem),
  }));
}

// ---------------------------------------------------------------- Conta do fotógrafo

/** Dados privados do fotógrafo dono desta conta de usuário. Só para o próprio fotógrafo. */
export async function buscarContaDoFotografo(usuarioId: string): Promise<FotografoConta | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .select()
    .from(t.fotografos)
    .where(eq(t.fotografos.usuarioId, usuarioId));
  return linha ? paraFotografo(linha) : null;
}

export async function slugDeFotografoEmUso(slug: string, excetoId?: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.fotografos.id })
    .from(t.fotografos)
    .where(
      excetoId
        ? and(eq(t.fotografos.slug, slug), ne(t.fotografos.id, excetoId))
        : eq(t.fotografos.slug, slug),
    );
  return linha !== undefined;
}

export async function criarContaDeFotografo(dados: {
  usuarioId: string;
  nomePublico: string;
  slug: string;
}): Promise<FotografoConta> {
  const banco = await obterBanco();
  const [linha] = await banco.insert(t.fotografos).values(dados).returning();
  return paraFotografo(linha);
}

/**
 * Cria a conta de fotógrafo só se o usuário ainda não tiver uma. Devolve `null` quando outra
 * requisição criou antes (usuario_id é único) ou quando o slug foi tomado no meio do caminho:
 * quem chama busca de novo ou tenta outro slug.
 */
export async function criarContaDeFotografoSeNaoExistir(dados: {
  usuarioId: string;
  nomePublico: string;
  slug: string;
}): Promise<FotografoConta | null> {
  const banco = await obterBanco();
  const [linha] = await banco.insert(t.fotografos).values(dados).onConflictDoNothing().returning();
  return linha ? paraFotografo(linha) : null;
}

export type AlteracoesPerfil = Partial<
  Pick<FotografoConta, "nomePublico" | "slug" | "bio" | "redesSociais" | "cpfCnpj" | "chavePix">
>;

/**
 * Troca o CPF/CNPJ da conta deste usuário: a chave Pix confirmada era o documento antigo e volta
 * a exigir confirmação, e a hora da troca fica gravada para segurar os saques por 72 horas.
 */
export async function trocarDocumentoDoFotografo(
  usuarioId: string,
  documento: string,
  agora: number,
) {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.fotografos)
    .set({ cpfCnpj: documento, chavePix: null, documentoTrocadoEm: new Date(agora) })
    .where(eq(t.fotografos.usuarioId, usuarioId))
    .returning();
  return linha ? paraFotografo(linha) : null;
}

/** Atualiza só a conta ligada a este usuário: nunca por um id vindo do navegador. */
export async function atualizarContaDoFotografo(usuarioId: string, alteracoes: AlteracoesPerfil) {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.fotografos)
    .set(alteracoes)
    .where(eq(t.fotografos.usuarioId, usuarioId))
    .returning();
  return linha ? paraFotografo(linha) : null;
}

export * from "./painel";
export * from "./admin";
export * from "./vendas-painel";
export * from "./loja-moderacao";
export * from "./crescimento";
export * from "./rostos";
export * from "./notificacoes";
export * from "./relatorio";
export * from "./estornos";
export * from "./exclusao";
export * from "./mfa";
export * from "./autores";
export * from "./rankings";
