// Pastas e subpastas das fotos de um evento (docs/arquitetura.md, "Pastas e subpastas"). No
// máximo 2 níveis: pasta de nível 1 → subpasta, sempre no mesmo evento. Só o dono do evento
// gerencia as pastas e muda a pasta das fotos; quem edita passa o id de quem está logado e a
// checagem de dono fica aqui. O gatilho da migração 0043 recusa o 3º nível como última barreira.

import "server-only";

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { arvoreDePastas, type PastaNaArvore } from "@/lib/pastas";

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
