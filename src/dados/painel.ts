// Funções de dados do painel do fotógrafo. Toda função recebe o id do fotógrafo logado e só
// mexe no que é dele: a checagem fica aqui (um WHERE fotografo_id = …), e não só na tela.

import "server-only";

import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import imagens from "./exemplo/imagens.json";
import { deIso, iso, paraEvento, paraFoto, paraLancamento, paraSaque } from "./mapas";
import type {
  Categoria,
  Evento,
  Foto,
  Lancamento,
  Saque,
  StatusEvento,
  StatusSaque,
} from "./tipos";

/** Evento como o painel lista: com contagens e sem a senha. */
export type EventoDoPainel = Evento & {
  categoria: Categoria;
  temSenha: boolean;
  totalItens: number;
  processando: number;
  vendidos: number;
};

async function paraPainel(linhas: (typeof t.eventos.$inferSelect)[]): Promise<EventoDoPainel[]> {
  if (linhas.length === 0) return [];
  const banco = await obterBanco();
  const ids = linhas.map((l) => l.id);
  const [cats, contagens, vendidos] = await Promise.all([
    banco.select().from(t.categorias),
    banco
      .select({
        eventoId: t.fotos.eventoId,
        prontas: sql<number>`count(*) filter (where ${t.fotos.status} = 'pronta')::int`,
        processando: sql<number>`count(*) filter (where ${t.fotos.status} = 'processando')::int`,
      })
      .from(t.fotos)
      .where(and(inArray(t.fotos.eventoId, ids), isNull(t.fotos.excluidaEm)))
      .groupBy(t.fotos.eventoId),
    // Itens não excluídos que aparecem em algum pedido pago.
    banco
      .select({
        eventoId: t.fotos.eventoId,
        total: sql<number>`count(distinct ${t.fotos.id})::int`,
      })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(
        and(
          inArray(t.fotos.eventoId, ids),
          eq(t.pedidos.status, "pago"),
          isNull(t.fotos.excluidaEm),
        ),
      )
      .groupBy(t.fotos.eventoId),
  ]);
  return linhas.map((l) => {
    const categoria = cats.find((c) => c.id === l.categoriaId);
    if (!categoria) throw new Error(`Categoria ${l.categoriaId} não existe`);
    const contagem = contagens.find((c) => c.eventoId === l.id);
    return {
      ...paraEvento(l),
      categoria,
      temSenha: l.senhaHash !== null,
      totalItens: contagem?.prontas ?? 0,
      processando: contagem?.processando ?? 0,
      vendidos: vendidos.find((v) => v.eventoId === l.id)?.total ?? 0,
    };
  });
}

export async function listarCategorias(): Promise<Categoria[]> {
  const banco = await obterBanco();
  return banco.select().from(t.categorias).orderBy(asc(t.categorias.nome));
}

/** Eventos de que o fotógrafo é dono, do mais recente para o mais antigo. */
export async function listarEventosDoFotografo(fotografoId: string): Promise<EventoDoPainel[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.eventos)
    .where(eq(t.eventos.fotografoId, fotografoId))
    .orderBy(desc(t.eventos.inicioEm));
  return paraPainel(linhas);
}

/** Evento do fotógrafo, ou `null` se não existir ou for de outra pessoa. */
export async function buscarEventoDoFotografo(
  eventoId: string,
  fotografoId: string,
): Promise<EventoDoPainel | null> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  return (await paraPainel(linhas))[0] ?? null;
}

export async function slugDeEventoEmUso(slug: string, excetoId?: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(
      excetoId
        ? and(eq(t.eventos.slug, slug), ne(t.eventos.id, excetoId))
        : eq(t.eventos.slug, slug),
    );
  return linha !== undefined;
}

export type DadosDoEvento = Omit<Evento, "id" | "fotografoId" | "status" | "capa">;

/** Dados do evento como o banco grava: as datas viram Date. */
function linhaDoEvento(dados: Partial<DadosDoEvento>): Partial<typeof t.eventos.$inferInsert> {
  const { inicioEm, fimEm, liberadoEm, ...resto } = dados;
  return {
    ...resto,
    ...(inicioEm !== undefined ? { inicioEm: new Date(inicioEm) } : {}),
    ...(fimEm !== undefined ? { fimEm: new Date(fimEm) } : {}),
    ...(liberadoEm !== undefined ? { liberadoEm: deIso(liberadoEm) } : {}),
  };
}

export async function criarEvento(fotografoId: string, dados: DadosDoEvento): Promise<Evento> {
  const banco = await obterBanco();
  const valores = {
    ...linhaDoEvento(dados),
    fotografoId,
    status: "rascunho",
  } as typeof t.eventos.$inferInsert;
  const [linha] = await banco.insert(t.eventos).values(valores).returning();
  return paraEvento(linha);
}

/** Atualiza um evento do fotógrafo. Devolve `null` se o evento não for dele. */
export async function atualizarEvento(
  eventoId: string,
  fotografoId: string,
  dados: Partial<DadosDoEvento>,
): Promise<Evento | null> {
  const banco = await obterBanco();
  const [linha] = await banco
    .update(t.eventos)
    .set(linhaDoEvento(dados))
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)))
    .returning();
  return linha ? paraEvento(linha) : null;
}

/** Guarda (ou apaga, com `null`) o hash da senha de um evento do fotógrafo. */
export async function definirSenhaDoEvento(
  eventoId: string,
  fotografoId: string,
  senhaHash: string | null,
) {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.eventos)
    .set({ senhaHash })
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)))
    .returning({ id: t.eventos.id });
  return atualizados.length > 0;
}

/**
 * Muda o status de um evento do fotógrafo, só a partir do status esperado (UPDATE com
 * WHERE status = …). O status `revisao` não entra nem sai por aqui: só a equipe mexe nele.
 */
export async function mudarStatusDoEvento(
  eventoId: string,
  fotografoId: string,
  de: Exclude<StatusEvento, "revisao">,
  para: Exclude<StatusEvento, "revisao">,
): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.eventos)
    .set({ status: para })
    .where(
      and(
        eq(t.eventos.id, eventoId),
        eq(t.eventos.fotografoId, fotografoId),
        eq(t.eventos.status, de),
      ),
    )
    .returning({ id: t.eventos.id });
  return atualizados.length > 0;
}

// ---------------------------------------------------------------- Fotos do evento

/** Itens do evento para o painel: todos os status, sem os excluídos, na ordem de envio. */
export async function listarItensDoPainel(eventoId: string, fotografoId: string) {
  const banco = await obterBanco();
  const [evento] = await banco
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.fotografoId, fotografoId)));
  if (!evento) return null;
  const [itens, vendidos] = await Promise.all([
    banco
      .select()
      .from(t.fotos)
      .where(and(eq(t.fotos.eventoId, eventoId), isNull(t.fotos.excluidaEm)))
      .orderBy(asc(t.fotos.ordem)),
    banco
      .selectDistinct({ fotoId: t.itensPedido.fotoId })
      .from(t.itensPedido)
      .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
      .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
      .where(and(eq(t.fotos.eventoId, eventoId), eq(t.pedidos.status, "pago"))),
  ]);
  const ids = new Set(vendidos.map((v) => v.fotoId));
  return itens.map((f) => ({ ...paraFoto(f), vendido: ids.has(f.id) }));
}

/**
 * Envio simulado (Parte A): cria os itens com as imagens de exemplo, já prontos. Na Fase 12, o
 * envio real cria cada item como `processando` e o job gera a prévia a partir do arquivo.
 * Envia o dono do evento ou um colaborador dele; o item fica no nome de quem enviou, que é
 * quem recebe pela venda.
 */
export async function adicionarItensSimulados(
  eventoId: string,
  fotografoId: string,
  arquivos: { nome: string; tamanhoBytes: number }[],
): Promise<Foto[] | null> {
  const banco = await obterBanco();
  const [evento] = await banco.select().from(t.eventos).where(eq(t.eventos.id, eventoId));
  const [colaborador] = await banco
    .select({ id: t.colaboradores.id })
    .from(t.colaboradores)
    .where(
      and(eq(t.colaboradores.eventoId, eventoId), eq(t.colaboradores.fotografoId, fotografoId)),
    );
  if (!evento || (evento.fotografoId !== fotografoId && !colaborador)) return null;

  const [{ ultima }] = await banco
    .select({ ultima: sql<number>`coalesce(max(${t.fotos.ordem}), 0)::int` })
    .from(t.fotos)
    .where(eq(t.fotos.eventoId, eventoId));
  const agora = Date.now();
  const novos = arquivos.map((arquivo, i) => {
    const imagem = (ultima + i) % imagens.length;
    const { largura, altura } = imagens[imagem];
    const vertical = imagem % 4 === 3;
    return {
      eventoId,
      enviadaPor: fotografoId,
      tipo: "foto" as const,
      urlPrevia: `/exemplo/previas/${imagem}.webp`,
      urlMiniatura: `/exemplo/miniaturas/${imagem}.webp`,
      // Original de exemplo: a mesma imagem do picsum, sem marca d'água.
      chaveOriginal: `https://picsum.photos/seed/clicouai-exemplo-${imagem}/${vertical ? "1600/2400" : "2400/1600"}.jpg`,
      nomeArquivo: arquivo.nome,
      largura,
      altura,
      tamanhoBytes: arquivo.tamanhoBytes,
      ordem: ultima + i + 1,
      status: "pronta" as const,
      criadoEm: new Date(agora + i),
    };
  });
  if (novos.length === 0) return [];
  const linhas = await banco.insert(t.fotos).values(novos).returning();
  return linhas.map(paraFoto);
}

/**
 * Exclusão lógica (docs/arquitetura.md): o item some da galeria, mas quem comprou continua
 * baixando. Só em evento do próprio fotógrafo.
 */
export async function excluirItem(fotoId: string, fotografoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.fotos)
    .set({ excluidaEm: new Date() })
    .where(
      and(
        eq(t.fotos.id, fotoId),
        isNull(t.fotos.excluidaEm),
        inArray(
          t.fotos.eventoId,
          banco
            .select({ id: t.eventos.id })
            .from(t.eventos)
            .where(eq(t.eventos.fotografoId, fotografoId)),
        ),
      ),
    )
    .returning({ id: t.fotos.id });
  return atualizados.length > 0;
}

// ---------------------------------------------------------------- Dinheiro do fotógrafo

export type LancamentoDoExtrato = Lancamento & { eventoTitulo: string; pagoEm: string | null };

/**
 * Lançamentos do fotógrafo com o evento e a data da venda, do mais recente para o mais
 * antigo. O cálculo de saldo e de saque fica em src/servicos/saques.ts.
 */
export async function listarLancamentosDoFotografo(
  fotografoId: string,
): Promise<LancamentoDoExtrato[]> {
  // Hora lida depois pelo chamador; espera a requisição (Cache Components).
  await connection();
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      lancamento: t.lancamentos,
      eventoTitulo: t.eventos.titulo,
      pagoEm: t.pedidos.pagoEm,
    })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(eq(t.lancamentos.fotografoId, fotografoId));
  return linhas
    .map((l) => ({
      ...paraLancamento(l.lancamento),
      eventoTitulo: l.eventoTitulo,
      pagoEm: iso(l.pagoEm),
    }))
    .sort((a, b) => (b.pagoEm ?? "").localeCompare(a.pagoEm ?? ""));
}

/** Fotógrafo tem chave Pix confirmada? Condição para publicar evento e sacar (docs/riscos.md). */
export async function temContaDeRecebimento(fotografoId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ chavePix: t.fotografos.chavePix })
    .from(t.fotografos)
    .where(eq(t.fotografos.id, fotografoId));
  return Boolean(linha?.chavePix);
}

// ---------------------------------------------------------------- Saques

/**
 * Cria o saque e prende nele os lançamentos, tudo ou nada: se algum lançamento já estiver em
 * outro saque (dois cliques ao mesmo tempo), nada muda. É uma transação: o UPDATE só pega
 * lançamentos ainda sem saque, e se não pegar todos, a transação é desfeita.
 */
export async function reservarLancamentosParaSaque(saque: Saque, lancamentoIds: string[]) {
  const banco = await obterBanco();
  try {
    await banco.transaction(async (tx) => {
      await tx.insert(t.saques).values({
        ...saque,
        criadoEm: deIso(saque.criadoEm),
        pagoEm: deIso(saque.pagoEm),
      });
      const presos = await tx
        .update(t.lancamentos)
        .set({ saqueId: saque.id })
        .where(
          and(
            inArray(t.lancamentos.id, lancamentoIds),
            eq(t.lancamentos.fotografoId, saque.fotografoId),
            isNull(t.lancamentos.saqueId),
          ),
        )
        .returning({ id: t.lancamentos.id });
      if (presos.length !== lancamentoIds.length) throw new SaqueConcorrente();
    });
    return true;
  } catch (erro) {
    if (erro instanceof SaqueConcorrente) return false;
    throw erro;
  }
}

class SaqueConcorrente extends Error {}

/** Muda o status do saque só a partir do status esperado. Devolve se mudou. */
export async function mudarStatusSaque(
  saqueId: string,
  de: StatusSaque,
  para: StatusSaque,
  extra: Partial<Pick<Saque, "gatewayId" | "pagoEm">> = {},
): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.saques)
    .set({
      status: para,
      ...("gatewayId" in extra ? { gatewayId: extra.gatewayId } : {}),
      ...("pagoEm" in extra ? { pagoEm: deIso(extra.pagoEm ?? null) } : {}),
    })
    .where(and(eq(t.saques.id, saqueId), eq(t.saques.status, de)))
    .returning({ id: t.saques.id });
  return atualizados.length > 0;
}

/** Saque que falhou devolve os lançamentos ao saldo, para o fotógrafo tentar de novo. */
export async function soltarLancamentosDoSaque(saqueId: string) {
  const banco = await obterBanco();
  await banco
    .update(t.lancamentos)
    .set({ saqueId: null })
    .where(eq(t.lancamentos.saqueId, saqueId));
}

export async function listarSaquesDoFotografo(fotografoId: string): Promise<Saque[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.saques)
    .where(eq(t.saques.fotografoId, fotografoId))
    .orderBy(desc(t.saques.criadoEm));
  return linhas.map(paraSaque);
}

/** Saques ainda em processamento, para conferir o status no Mercado Pago. */
export async function listarSaquesProcessando(fotografoId: string): Promise<Saque[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.saques)
    .where(and(eq(t.saques.fotografoId, fotografoId), eq(t.saques.status, "processando")));
  return linhas.map(paraSaque);
}
