// Dados das notificações (lembrete do Pix e aviso de venda ao fotógrafo) e das tentativas de
// ações sensíveis (limite contra abuso). Os envios em si ficam em src/servicos/mensagens.ts.

import "server-only";

import { and, eq, gt, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { paraPedido } from "./mapas";
import type { PedidoInterno } from "./tipos";

// ---------------------------------------------------------------- Lembrete do Pix

/**
 * Pedidos Pix com o QR Code gerado, ainda pendentes e dentro do prazo, criados há pelo menos
 * `esperaMs` e que ainda não receberam o lembrete "seu Pix vence em X minutos".
 */
export async function listarPixParaLembrar(
  instante: number,
  esperaMs: number,
): Promise<PedidoInterno[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.pedidos)
    .where(
      and(
        eq(t.pedidos.status, "pendente"),
        eq(t.pedidos.metodo, "pix"),
        isNotNull(t.pedidos.pixCopiaECola),
        isNull(t.pedidos.lembretePixEm),
        lte(t.pedidos.criadoEm, new Date(instante - esperaMs)),
        gt(t.pedidos.expiraEm, new Date(instante)),
      ),
    );
  return linhas.map(paraPedido);
}

/** Marca o lembrete do Pix como enviado, só se ainda não estava. Devolve se marcou. */
export async function marcarLembretePix(pedidoId: string): Promise<boolean> {
  const banco = await obterBanco();
  const atualizados = await banco
    .update(t.pedidos)
    .set({ lembretePixEm: new Date() })
    .where(and(eq(t.pedidos.id, pedidoId), isNull(t.pedidos.lembretePixEm)))
    .returning({ id: t.pedidos.id });
  return atualizados.length > 0;
}

// ---------------------------------------------------------------- Aviso de venda

export type VendaParaAvisar = {
  fotografoId: string;
  nome: string;
  email: string;
  valorCentavos: number;
  itens: number;
  eventos: string[];
};

/**
 * Quanto cada fotógrafo ganhou num pedido pago (a parte dele, bruta), com o e-mail da conta,
 * para o aviso "você vendeu". Inclui a parte do dono quando a foto é de um colaborador.
 */
export async function vendasDoPedidoPorFotografo(pedidoId: string): Promise<VendaParaAvisar[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      fotografoId: t.fotografos.id,
      nome: t.fotografos.nomePublico,
      email: t.usuarios.email,
      valorCentavos: t.lancamentos.valorCentavos,
      evento: t.eventos.titulo,
    })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.lancamentos.fotografoId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId))
    .where(eq(t.itensPedido.pedidoId, pedidoId));

  const porFotografo = new Map<string, VendaParaAvisar>();
  for (const l of linhas) {
    const atual = porFotografo.get(l.fotografoId) ?? {
      fotografoId: l.fotografoId,
      nome: l.nome,
      email: l.email,
      valorCentavos: 0,
      itens: 0,
      eventos: [],
    };
    atual.valorCentavos += l.valorCentavos;
    atual.itens++;
    if (!atual.eventos.includes(l.evento)) atual.eventos.push(l.evento);
    porFotografo.set(l.fotografoId, atual);
  }
  return [...porFotografo.values()];
}

// ---------------------------------------------------------------- Tentativas (limite)

/**
 * Registra uma tentativa e diz se a chave passou do limite na janela. Guardado no banco para
 * valer entre todos os servidores da Vercel. A chave já vem como hash, sem o IP nem o e-mail.
 */
export async function registrarTentativa(
  chave: string,
  limite: number,
  janelaMs: number,
): Promise<{ bloqueado: boolean }> {
  const banco = await obterBanco();
  const desde = new Date(Date.now() - janelaMs);
  const [{ total }] = await banco
    .select({ total: sql<number>`count(*)::int` })
    .from(t.tentativas)
    .where(and(eq(t.tentativas.chave, chave), gte(t.tentativas.em, desde)));
  if (total >= limite) return { bloqueado: true };
  await banco.insert(t.tentativas).values({ chave });
  return { bloqueado: false };
}

/** Apaga as tentativas de uma chave (ex.: depois de um login certo). */
export async function limparTentativas(chave: string) {
  const banco = await obterBanco();
  await banco.delete(t.tentativas).where(eq(t.tentativas.chave, chave));
}

/** Apaga tentativas antigas, para a tabela não crescer sem fim (roda no job de pedidos). */
export async function apagarTentativasAntigas(antesDe: number) {
  const banco = await obterBanco();
  await banco.delete(t.tentativas).where(lt(t.tentativas.em, new Date(antesDe)));
}
