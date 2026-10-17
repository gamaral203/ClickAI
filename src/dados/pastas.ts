// Pastas e subpastas das fotos de um evento (docs/arquitetura.md, "Pastas e subpastas"). No
// máximo 2 níveis: pasta de nível 1 → subpasta, sempre no mesmo evento. Só o dono do evento
// gerencia as pastas; o colaborador com o convite aceito vê as pastas, escolhe uma delas como
// destino do envio e põe nelas só as fotos que ele enviou. Quem edita passa o id de quem está logado e a checagem fica aqui. O gatilho da migração 0043 recusa o 3º nível como última barreira.

import "server-only";

import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  DIA_TODOS,
  intervaloDoDia,
  PASTA_TODAS,
  SEM_DATA,
  SEM_PASTA,
  type FiltroDoPainel,
} from "@/lib/filtro-painel";
import { arvoreDePastas, idsDaPastaComSubpastas, type PastaNaArvore } from "@/lib/pastas";

import { paraPasta } from "./mapas";
import type { Pasta } from "./tipos";

type Banco = Awaited<ReturnType<typeof obterBanco>>;
type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

export type ResultadoPasta = { erro: string } | { pasta: Pasta };

const NAO_ENCONTRADA = "Pasta não encontrada.";
const SEM_TERCEIRO_NIVEL = "Só dá para criar subpasta dentro de uma pasta, sem 3º nível.";

async function eventoDoDono(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return linha !== undefined;
}

/**
 * O fotógrafo é o dono do evento ou colaborador com o convite aceito. O colaborador só VÊ as
 * pastas e põe nelas as fotos que ele mesmo enviou; criar, renomear, mover e excluir pastas
 * continua só do dono.
 */
async function eventoDoDonoOuColaborador(eventoId: string, fotografoId: string) {
  if (await eventoDoDono(eventoId, fotografoId)) return true;
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.colaboradores.id })
    .from(t.colaboradores)
    .where(
      and(
        eq(t.colaboradores.eventoId, eventoId),
        eq(t.colaboradores.fotografoId, fotografoId),
        isNotNull(t.colaboradores.aceitoEm),
      ),
    );
  return linha !== undefined;
}

/** A pasta, se for de um evento deste fotógrafo (outro id dá `null`, como se não existisse). */
async function pastaDoDono(db: Banco | Transacao, pastaId: string, fotografoId: string) {
  const [linha] = await db
    .select({ pasta: t.pastas })
    .from(t.pastas)
    .innerJoin(t.eventos, eq(t.eventos.id, t.pastas.eventoId))
    .where(and(eq(t.pastas.id, pastaId), eq(t.eventos.fotografoId, fotografoId)));
  return linha?.pasta ?? null;
}

/** Próxima ordem entre as irmãs (mesmo evento e mesma pasta de cima). */
async function proximaOrdem(db: Banco | Transacao, eventoId: string, pastaPaiId: string | null) {
  const [{ ultima }] = await db
    .select({ ultima: sql<number>`coalesce(max(${t.pastas.ordem}), 0)::int` })
    .from(t.pastas)
    .where(
      and(
        eq(t.pastas.eventoId, eventoId),
        pastaPaiId ? eq(t.pastas.pastaPaiId, pastaPaiId) : isNull(t.pastas.pastaPaiId),
      ),
    );
  return Number(ultima) + 1;
}

export type PastaComTotal = PastaNaArvore<Pasta> & {
  /** Itens (fotos e vídeos não excluídos) diretamente nesta pasta. */
  totalItens: number;
  /** Na pasta de nível 1: os dela mais os das subpastas. Na subpasta, igual a `totalItens`. */
  totalComSubpastas: number;
  /** Quantas subpastas tem (0 na subpasta). */
  subpastas: number;
};

/** Pastas de um evento do fotógrafo, em árvore (nível 1 e as subpastas logo abaixo). */
export async function listarPastasDoPainel(
  eventoId: string,
  fotografoId: string,
): Promise<PastaComTotal[] | null> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return null;
  return arvoreComTotais(eventoId);
}

/**
 * Pastas do evento para o dono ou para um colaborador com o convite aceito (na página de
 * colaborações, para pôr as fotos dele nas pastas). Outro fotógrafo recebe `null`.
 */
export async function listarPastasDoPainelOuColaborador(
  eventoId: string,
  fotografoId: string,
): Promise<PastaComTotal[] | null> {
  if (!(await eventoDoDonoOuColaborador(eventoId, fotografoId))) return null;
  return arvoreComTotais(eventoId);
}

async function arvoreComTotais(eventoId: string): Promise<PastaComTotal[]> {
  const banco = await obterBanco();
  const [pastas, contagens] = await Promise.all([
    banco
      .select()
      .from(t.pastas)
      .where(eq(t.pastas.eventoId, eventoId))
      .orderBy(asc(t.pastas.ordem)),
    banco
      .select({ pastaId: t.fotos.pastaId, total: sql<number>`count(*)::int` })
      .from(t.fotos)
      .where(and(eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm)))
      .groupBy(t.fotos.pastaId),
  ]);
  const total = new Map(contagens.map((c) => [c.pastaId, Number(c.total)]));
  return arvoreDePastas(pastas.map(paraPasta)).map((p, _, todas) => {
    const filhas = p.nivel === 1 ? todas.filter((f) => f.pastaPaiId === p.id) : [];
    const proprios = total.get(p.id) ?? 0;
    return {
      ...p,
      totalItens: proprios,
      totalComSubpastas: proprios + filhas.reduce((s, f) => s + (total.get(f.id) ?? 0), 0),
      subpastas: filhas.length,
    };
  });
}

/**
 * Cria uma pasta de nível 1 ou, com `pastaPaiId`, uma subpasta. A pasta de cima tem de ser de
 * nível 1 e do mesmo evento (sem 3º nível).
 */
export async function criarPasta(
  eventoId: string,
  fotografoId: string,
  nome: string,
  pastaPaiId: string | null = null,
): Promise<ResultadoPasta> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return { erro: "Evento não encontrado." };
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    if (pastaPaiId) {
      const pai = await pastaDoDono(tx, pastaPaiId, fotografoId);
      if (!pai || pai.eventoId !== eventoId) return { erro: NAO_ENCONTRADA };
      if (pai.pastaPaiId) return { erro: SEM_TERCEIRO_NIVEL };
    }
    const [linha] = await tx
      .insert(t.pastas)
      .values({ eventoId, pastaPaiId, nome, ordem: await proximaOrdem(tx, eventoId, pastaPaiId) })
      .returning();
    return { pasta: paraPasta(linha) };
  });
}

export async function renomearPasta(pastaId: string, fotografoId: string, nome: string) {
  const banco = await obterBanco();
  if (!(await pastaDoDono(banco, pastaId, fotografoId))) return false;
  const atualizadas = await banco
    .update(t.pastas)
    .set({ nome })
    .where(eq(t.pastas.id, pastaId))
    .returning({ id: t.pastas.id });
  return atualizadas.length > 0;
}

/**
 * Muda a pasta de lugar: `novoPaiId` nulo leva para o nível 1; senão, vira subpasta dela. A
 * nova pasta de cima tem de ser de nível 1, do mesmo evento e outra pasta; uma pasta que tem
 * subpastas não vira subpasta (seriam 3 níveis). Entra no fim da lista do novo lugar.
 */
export async function moverPasta(
  pastaId: string,
  fotografoId: string,
  novoPaiId: string | null,
): Promise<{ erro?: string }> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const pasta = await pastaDoDono(tx, pastaId, fotografoId);
    if (!pasta) return { erro: NAO_ENCONTRADA };
    if ((pasta.pastaPaiId ?? null) === novoPaiId) return {};
    if (novoPaiId) {
      if (novoPaiId === pastaId) return { erro: "A pasta não pode ficar dentro dela mesma." };
      const pai = await pastaDoDono(tx, novoPaiId, fotografoId);
      if (!pai || pai.eventoId !== pasta.eventoId) return { erro: NAO_ENCONTRADA };
      if (pai.pastaPaiId) return { erro: SEM_TERCEIRO_NIVEL };
      const [filha] = await tx
        .select({ id: t.pastas.id })
        .from(t.pastas)
        .where(eq(t.pastas.pastaPaiId, pastaId))
        .limit(1);
      if (filha) {
        return { erro: "Esta pasta tem subpastas: mova ou exclua as subpastas antes." };
      }
    }
    await tx
      .update(t.pastas)
      .set({ pastaPaiId: novoPaiId, ordem: await proximaOrdem(tx, pasta.eventoId, novoPaiId) })
      .where(eq(t.pastas.id, pastaId));
    return {};
  });
}

/** Sobe ou desce a pasta uma posição entre as irmãs (mesmo nível e mesma pasta de cima). */
export async function reordenarPasta(
  pastaId: string,
  fotografoId: string,
  direcao: "subir" | "descer",
): Promise<boolean> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const pasta = await pastaDoDono(tx, pastaId, fotografoId);
    if (!pasta) return false;
    const irmas = await tx
      .select({ id: t.pastas.id })
      .from(t.pastas)
      .where(
        and(
          eq(t.pastas.eventoId, pasta.eventoId),
          pasta.pastaPaiId
            ? eq(t.pastas.pastaPaiId, pasta.pastaPaiId)
            : isNull(t.pastas.pastaPaiId),
        ),
      )
      .orderBy(asc(t.pastas.ordem), asc(t.pastas.nome), asc(t.pastas.id));
    const ids = irmas.map((i) => i.id);
    const de = ids.indexOf(pastaId);
    const para = direcao === "subir" ? de - 1 : de + 1;
    if (de < 0 || para < 0 || para >= ids.length) return true;
    [ids[de], ids[para]] = [ids[para], ids[de]];
    // Renumera as irmãs de 1 em diante: tira empates antigos de ordem.
    for (const [i, id] of ids.entries()) {
      await tx
        .update(t.pastas)
        .set({ ordem: i + 1 })
        .where(eq(t.pastas.id, id));
    }
    return true;
  });
}

/**
 * Apaga a pasta e as subpastas dela. As fotos NUNCA são apagadas: na mesma transação, antes de
 * apagar, as fotos da pasta e das subpastas (inclusive as excluídas) ficam sem pasta. O
 * `on delete cascade` das subpastas e o `set null` das fotos ficam só como rede de segurança.
 */
export async function excluirPasta(
  pastaId: string,
  fotografoId: string,
): Promise<{ subpastas: number; fotos: number } | null> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const pasta = await pastaDoDono(tx, pastaId, fotografoId);
    if (!pasta) return null;
    const subpastas = await tx
      .select({ id: t.pastas.id })
      .from(t.pastas)
      .where(eq(t.pastas.pastaPaiId, pastaId));
    const ids = [pastaId, ...subpastas.map((s) => s.id)];
    const soltas = await tx
      .update(t.fotos)
      .set({ pastaId: null })
      .where(inArray(t.fotos.pastaId, ids))
      .returning({ id: t.fotos.id });
    await tx.delete(t.pastas).where(or(eq(t.pastas.id, pastaId), eq(t.pastas.pastaPaiId, pastaId)));
    return { subpastas: subpastas.length, fotos: soltas.length };
  });
}

/**
 * A pasta existe no evento e o fotógrafo é o dono do evento (o envio com pasta de destino e o
 * mover fotos usam isto). Vale para pasta de nível 1 ou subpasta.
 */
export async function pastaDoEventoDoDono(eventoId: string, pastaId: string, fotografoId: string) {
  const banco = await obterBanco();
  const pasta = await pastaDoDono(banco, pastaId, fotografoId);
  return pasta !== null && pasta.eventoId === eventoId;
}

/**
 * Pasta de destino de um envio: a pasta (de nível 1 ou subpasta) existe NESTE evento e quem
 * envia é o dono ou um colaborador com o convite aceito. O colaborador só escolhe entre as
 * pastas que o dono criou (não cria nem muda pastas); pasta de outro evento é recusada.
 */
export async function pastaDoEventoParaEnvio(
  eventoId: string,
  pastaId: string,
  fotografoId: string,
) {
  if (!(await eventoDoDonoOuColaborador(eventoId, fotografoId))) return false;
  const banco = await obterBanco();
  const [pasta] = await banco
    .select({ id: t.pastas.id })
    .from(t.pastas)
    .where(and(eq(t.pastas.id, pastaId), eq(t.pastas.eventoId, eventoId)));
  return pasta !== undefined;
}

/** Move itens de um evento do fotógrafo para uma pasta (ou subpasta) do mesmo evento, ou para nenhuma. */
export async function moverItensParaPasta(
  fotoIds: string[],
  pastaId: string | null,
  fotografoId: string,
): Promise<boolean> {
  const unicos = [...new Set(fotoIds)];
  if (unicos.length === 0) return false;
  const banco = await obterBanco();
  const itens = await banco
    .select({ id: t.fotos.id, eventoId: t.fotos.eventoId })
    .from(t.fotos)
    .where(and(inArray(t.fotos.id, unicos), isNull(t.fotos.excluidaEm)));
  if (itens.length !== unicos.length) return false;
  const eventoId = itens[0].eventoId;
  if (
    !itens.every((f) => f.eventoId === eventoId) ||
    !(await eventoDoDono(eventoId, fotografoId))
  ) {
    return false;
  }
  if (pastaId !== null && !(await pastaDoEventoDoDono(eventoId, pastaId, fotografoId))) {
    return false;
  }
  await banco.update(t.fotos).set({ pastaId }).where(inArray(t.fotos.id, unicos));
  return true;
}

/**
 * Como `moverItensParaPasta`, mas aceita também o colaborador com o convite aceito: ele só
 * move as fotos que ELE enviou (`fotos.enviada_por`), e só para uma pasta do mesmo evento. O
 * dono continua movendo qualquer foto do evento.
 */
export async function moverItensParaPastaOuColaborador(
  fotoIds: string[],
  pastaId: string | null,
  fotografoId: string,
): Promise<boolean> {
  const unicos = [...new Set(fotoIds)];
  if (unicos.length === 0) return false;
  const banco = await obterBanco();
  const itens = await banco
    .select({ id: t.fotos.id, eventoId: t.fotos.eventoId, autorId: t.fotos.enviadaPor })
    .from(t.fotos)
    .where(and(inArray(t.fotos.id, unicos), isNull(t.fotos.excluidaEm)));
  if (itens.length !== unicos.length) return false;
  const eventoId = itens[0].eventoId;
  if (!itens.every((f) => f.eventoId === eventoId)) return false;
  if (!(await eventoDoDono(eventoId, fotografoId))) {
    if (!(await eventoDoDonoOuColaborador(eventoId, fotografoId))) return false;
    if (!itens.every((f) => f.autorId === fotografoId)) return false;
  }
  if (pastaId !== null) {
    const [pasta] = await banco
      .select({ id: t.pastas.id })
      .from(t.pastas)
      .where(and(eq(t.pastas.id, pastaId), eq(t.pastas.eventoId, eventoId)));
    if (!pasta) return false;
  }
  await banco.update(t.fotos).set({ pastaId }).where(inArray(t.fotos.id, unicos));
  return true;
}

/** Pastas de um evento, para a galeria: id, nome, pasta de cima e ordem. */
export async function pastasDoEvento(eventoId: string) {
  const banco = await obterBanco();
  return banco
    .select({
      id: t.pastas.id,
      nome: t.pastas.nome,
      pastaPaiId: t.pastas.pastaPaiId,
      ordem: t.pastas.ordem,
    })
    .from(t.pastas)
    .where(eq(t.pastas.eventoId, eventoId))
    .orderBy(asc(t.pastas.ordem));
}

// ---------------------------------------------------------------- Mover em massa (painel)

/** O que mover: ids escolhidos na grade ou "todas do filtro" (o filtro, não milhares de ids). */
export type SelecaoParaMover =
  { tipo: "ids"; ids: string[] } | { tipo: "filtro"; filtro: FiltroDoPainel };

export type ResultadoMoverFotos = { movidas: number } | { erro: string };

/**
 * Condições SQL do filtro da grade do painel, iguais às de `filtrarItensDoPainel`
 * (src/lib/filtro-painel.ts): sempre o evento e só as fotos não excluídas (o painel não mostra
 * as excluídas). `null` quando a pasta do filtro não é deste evento.
 */
async function condicoesDoFiltro(
  db: Banco | Transacao,
  eventoId: string,
  filtro: FiltroDoPainel,
  agora: number,
): Promise<SQL[] | null> {
  const condicoes: SQL[] = [eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm)];
  const momento = new Date(agora);
  if (filtro.liberacao === "liberada") condicoes.push(lte(t.fotos.liberarEm, momento));
  if (filtro.liberacao === "agendada") condicoes.push(gt(t.fotos.liberarEm, momento));
  if (filtro.liberacao === "manual") condicoes.push(isNull(t.fotos.liberarEm));
  if (filtro.pasta === SEM_PASTA) {
    condicoes.push(isNull(t.fotos.pastaId));
  } else if (filtro.pasta !== PASTA_TODAS) {
    const pastas = await db
      .select({ id: t.pastas.id, pastaPaiId: t.pastas.pastaPaiId })
      .from(t.pastas)
      .where(eq(t.pastas.eventoId, eventoId));
    if (!pastas.some((p) => p.id === filtro.pasta)) return null;
    condicoes.push(inArray(t.fotos.pastaId, [...idsDaPastaComSubpastas(filtro.pasta, pastas)]));
  }
  if (filtro.dia !== DIA_TODOS) {
    if (filtro.dia === SEM_DATA) {
      if (filtro.base === "envio") return null;
      condicoes.push(isNull(t.fotos.capturadaEm));
    } else {
      const intervalo = intervaloDoDia(filtro.dia);
      if (!intervalo) return null;
      const coluna = filtro.base === "envio" ? t.fotos.criadoEm : t.fotos.capturadaEm;
      condicoes.push(gte(coluna, intervalo.inicio), lt(coluna, intervalo.fim));
    }
  }
  return condicoes;
}

/** Quantas fotos o filtro pega agora, reavaliado no servidor. Só o dono do evento. */
export async function contarFotosDoFiltro(
  eventoId: string,
  fotografoId: string,
  filtro: FiltroDoPainel,
  agora = Date.now(),
): Promise<number | null> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return null;
  const banco = await obterBanco();
  const condicoes = await condicoesDoFiltro(banco, eventoId, filtro, agora);
  if (!condicoes) return null;
  const [{ total }] = await banco
    .select({ total: sql<number>`count(*)::int` })
    .from(t.fotos)
    .where(and(...condicoes));
  return Number(total);
}

/**
 * Move para uma pasta (ou subpasta) do evento, ou tira da pasta (`pastaId` nulo), as fotos
 * escolhidas por id ou todas as do filtro, reavaliado aqui na hora (do navegador vem só o
 * filtro). Só o dono do evento; pasta de outro evento e foto de outro evento são recusadas.
 * Um UPDATE só, numa transação. O colaborador continua movendo só as fotos dele, uma por vez,
 * em Colaborações (`moverItensParaPastaOuColaborador`).
 */
export async function moverFotosDoPainel(
  eventoId: string,
  fotografoId: string,
  selecao: SelecaoParaMover,
  pastaId: string | null,
  agora = Date.now(),
): Promise<ResultadoMoverFotos> {
  if (!(await eventoDoDono(eventoId, fotografoId))) return { erro: "Evento não encontrado." };
  const banco = await obterBanco();
  return banco.transaction(async (tx): Promise<ResultadoMoverFotos> => {
    if (pastaId !== null) {
      const [pasta] = await tx
        .select({ id: t.pastas.id })
        .from(t.pastas)
        .where(and(eq(t.pastas.id, pastaId), eq(t.pastas.eventoId, eventoId)));
      if (!pasta) return { erro: NAO_ENCONTRADA };
    }
    let condicoes: SQL[];
    if (selecao.tipo === "ids") {
      const unicos = [...new Set(selecao.ids)];
      if (unicos.length === 0) return { erro: "Nenhuma foto selecionada." };
      condicoes = [
        eq(t.fotos.eventoId, eventoId),
        isNull(t.fotos.excluidaEm),
        inArray(t.fotos.id, unicos),
      ];
      // Tudo ou nada: um id de outro evento (ou já excluído) recusa o lote inteiro.
      const [{ total }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(t.fotos)
        .where(and(...condicoes));
      if (Number(total) !== unicos.length) return { erro: "Algumas fotos não são deste evento." };
    } else {
      const doFiltro = await condicoesDoFiltro(tx, eventoId, selecao.filtro, agora);
      if (!doFiltro) return { erro: NAO_ENCONTRADA };
      condicoes = doFiltro;
    }
    const movidas = await tx
      .update(t.fotos)
      .set({ pastaId })
      .where(and(...condicoes))
      .returning({ id: t.fotos.id });
    return { movidas: movidas.length };
  });
}
