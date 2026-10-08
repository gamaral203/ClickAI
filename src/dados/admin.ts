// Funções de dados do painel de gestão (/admin). Só a equipe do ClicouAí chama estas funções:
// a checagem de papel fica em cada página e ação (exigirGestor), e aqui nada é filtrado por
// dono, porque a equipe vê tudo.

import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";

import { iso, paraSaque } from "./mapas";
import type { MetodoPagamento, Papel, Saque, StatusPedido } from "./tipos";

export type ResumoGeral = {
  /** Soma dos pedidos pagos: o que entrou na conta da plataforma. */
  entradaCentavos: number;
  pedidosPagos: number;
  pedidosPendentes: number;
  /** Pedidos com chargeback em disputa: precisam de acompanhamento em /admin/vendas. */
  pedidosContestados: number;
  pedidosEstornados: number;
  /** Soma dos saques pagos: o que saiu para os fotógrafos. */
  saidaCentavos: number;
  /** Taxas (comissão e antecipação) dos saques pagos: o que ficou com a plataforma. */
  taxasCentavos: number;
  /** Vendas ainda não sacadas: dinheiro na conta que é dos fotógrafos (bruto). */
  aPagarCentavos: number;
  saquesProcessando: number;
  usuariosPorPapel: Record<Papel, number>;
};

/** Lançamento ainda não pago num saque: sem saque, ou num saque que não está pago. */
const naoSacado = sql`(${t.lancamentos.saqueId} is null or ${t.lancamentos.saqueId} not in (select ${t.saques.id} from ${t.saques} where ${t.saques.status} = 'pago'))`;

export async function resumoGeral(): Promise<ResumoGeral> {
  await connection();
  const banco = await obterBanco();
  const [[pedidos], [saques], [aPagar], papeis] = await Promise.all([
    banco
      .select({
        entrada: sql<number>`coalesce(sum(${t.pedidos.totalCentavos}) filter (where ${t.pedidos.status} = 'pago'), 0)::int`,
        pagos: sql<number>`count(*) filter (where ${t.pedidos.status} = 'pago')::int`,
        pendentes: sql<number>`count(*) filter (where ${t.pedidos.status} = 'pendente')::int`,
        contestados: sql<number>`count(*) filter (where ${t.pedidos.status} = 'contestado')::int`,
        estornados: sql<number>`count(*) filter (where ${t.pedidos.status} = 'estornado')::int`,
      })
      .from(t.pedidos),
    banco
      .select({
        saida: sql<number>`coalesce(sum(${t.saques.liquidoCentavos}) filter (where ${t.saques.status} = 'pago'), 0)::int`,
        taxas: sql<number>`coalesce(sum(${t.saques.taxaCentavos}) filter (where ${t.saques.status} = 'pago'), 0)::int`,
        processando: sql<number>`count(*) filter (where ${t.saques.status} = 'processando')::int`,
      })
      .from(t.saques),
    banco
      .select({ total: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}), 0)::int` })
      .from(t.lancamentos)
      .where(naoSacado),
    banco
      .select({ papel: t.usuarios.papel, total: sql<number>`count(*)::int` })
      .from(t.usuarios)
      .groupBy(t.usuarios.papel),
  ]);
  const porPapel: Record<Papel, number> = { cliente: 0, fotografo: 0, admin: 0 };
  for (const p of papeis) porPapel[p.papel] = p.total;
  return {
    entradaCentavos: pedidos.entrada,
    pedidosPagos: pedidos.pagos,
    pedidosPendentes: pedidos.pendentes,
    pedidosContestados: pedidos.contestados,
    pedidosEstornados: pedidos.estornados,
    saidaCentavos: saques.saida,
    taxasCentavos: saques.taxas,
    aPagarCentavos: aPagar.total,
    saquesProcessando: saques.processando,
    usuariosPorPapel: porPapel,
  };
}

export type ResumoFotografo = {
  fotografoId: string;
  nome: string;
  email: string;
  vendidoCentavos: number;
  sacadoCentavos: number;
  taxasCentavos: number;
  aPagarCentavos: number;
  chavePixConfirmada: boolean;
};

/** Uma linha por fotógrafo: quanto vendeu, quanto já sacou e quanto ainda tem a receber. */
export async function resumoPorFotografo(): Promise<ResumoFotografo[]> {
  await connection();
  const banco = await obterBanco();
  const [contas, vendas, saques] = await Promise.all([
    banco
      .select({
        id: t.fotografos.id,
        nome: t.fotografos.nomePublico,
        email: t.usuarios.email,
        chavePix: t.fotografos.chavePix,
      })
      .from(t.fotografos)
      .innerJoin(t.usuarios, eq(t.usuarios.id, t.fotografos.usuarioId)),
    banco
      .select({
        id: t.lancamentos.fotografoId,
        vendido: sql<number>`sum(${t.lancamentos.valorCentavos})::int`,
        aPagar: sql<number>`coalesce(sum(${t.lancamentos.valorCentavos}) filter (where ${naoSacado}), 0)::int`,
      })
      .from(t.lancamentos)
      .groupBy(t.lancamentos.fotografoId),
    banco
      .select({
        id: t.saques.fotografoId,
        sacado: sql<number>`sum(${t.saques.liquidoCentavos})::int`,
        taxas: sql<number>`sum(${t.saques.taxaCentavos})::int`,
      })
      .from(t.saques)
      .where(eq(t.saques.status, "pago"))
      .groupBy(t.saques.fotografoId),
  ]);
  return contas
    .map((f) => {
      const v = vendas.find((x) => x.id === f.id);
      const s = saques.find((x) => x.id === f.id);
      return {
        fotografoId: f.id,
        nome: f.nome,
        email: f.email,
        vendidoCentavos: v?.vendido ?? 0,
        sacadoCentavos: s?.sacado ?? 0,
        taxasCentavos: s?.taxas ?? 0,
        aPagarCentavos: v?.aPagar ?? 0,
        chavePixConfirmada: f.chavePix !== null,
      };
    })
    .sort((a, b) => b.vendidoCentavos - a.vendidoCentavos);
}

export type PedidoDoAdmin = {
  id: string;
  criadoEm: string;
  pagoEm: string | null;
  status: StatusPedido;
  metodo: MetodoPagamento;
  totalCentavos: number;
  nomeComprador: string;
  emailComprador: string;
  itens: number;
  fotografos: string[];
  gatewayId: string | null;
  /** O gestor pediu o reembolso e o Mercado Pago ainda não confirmou (downloads já parados). */
  reembolsoSolicitadoEm: string | null;
};

/** Todos os pedidos, do mais recente para o mais antigo. */
export async function listarPedidosDoAdmin(): Promise<PedidoDoAdmin[]> {
  await connection();
  const banco = await obterBanco();
  const [pedidos, itens] = await Promise.all([
    banco.select().from(t.pedidos).orderBy(desc(t.pedidos.criadoEm)),
    banco
      .select({ pedidoId: t.itensPedido.pedidoId, nome: t.fotografos.nomePublico })
      .from(t.itensPedido)
      .innerJoin(t.fotografos, eq(t.fotografos.id, t.itensPedido.fotografoId)),
  ]);
  return pedidos.map((p) => {
    const meus = itens.filter((i) => i.pedidoId === p.id);
    return {
      id: p.id,
      criadoEm: iso(p.criadoEm),
      pagoEm: iso(p.pagoEm),
      status: p.status,
      metodo: p.metodo,
      totalCentavos: p.totalCentavos,
      nomeComprador: p.nomeComprador,
      emailComprador: p.emailComprador,
      itens: meus.length,
      fotografos: [...new Set(meus.map((i) => i.nome))],
      gatewayId: p.gatewayId,
      reembolsoSolicitadoEm: iso(p.reembolsoSolicitadoEm),
    };
  });
}

export type SaqueDoAdmin = Saque & { fotografoNome: string };

/** Todos os saques, do mais recente para o mais antigo. */
export async function listarSaquesDoAdmin(): Promise<SaqueDoAdmin[]> {
  await connection();
  const banco = await obterBanco();
  const linhas = await banco
    .select({ saque: t.saques, nome: t.fotografos.nomePublico })
    .from(t.saques)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.saques.fotografoId))
    .orderBy(desc(t.saques.criadoEm));
  return linhas.map((l) => ({ ...paraSaque(l.saque), fotografoNome: l.nome }));
}

export type UsuarioDoAdmin = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  temGoogle: boolean;
  temSenha: boolean;
  emailConfirmado: boolean;
  criadoEm: string;
};

/** Todos os usuários, do mais recente para o mais antigo. Nunca devolve o hash da senha. */
export async function listarUsuariosDoAdmin(): Promise<UsuarioDoAdmin[]> {
  await connection();
  const banco = await obterBanco();
  const linhas = await banco.select().from(t.usuarios).orderBy(desc(t.usuarios.criadoEm));
  return linhas.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    temGoogle: u.googleId !== null,
    temSenha: u.senhaHash !== null,
    emailConfirmado: u.emailConfirmadoEm !== null,
    criadoEm: iso(u.criadoEm),
  }));
}
