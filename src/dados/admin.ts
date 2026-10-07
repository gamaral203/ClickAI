// Funções de dados do painel de gestão (/admin). Só a equipe do ClicouAí chama estas funções:
// a checagem de papel fica em cada página e ação (exigirGestor), e aqui nada é filtrado por
// dono, porque a equipe vê tudo.

import "server-only";

import { connection } from "next/server";

import { fotografos } from "./exemplo/banco";
import { itensPorPedido, lancamentos, pedidos, saques } from "./exemplo/pedidos";
import { usuarios } from "./exemplo/usuarios";
import type { MetodoPagamento, Papel, Saque, StatusPedido } from "./tipos";

export type ResumoGeral = {
  /** Soma dos pedidos pagos: o que entrou na conta da plataforma. */
  entradaCentavos: number;
  pedidosPagos: number;
  pedidosPendentes: number;
  /** Soma dos saques pagos: o que saiu para os fotógrafos. */
  saidaCentavos: number;
  /** Taxas (comissão e antecipação) dos saques pagos: o que ficou com a plataforma. */
  taxasCentavos: number;
  /** Vendas ainda não sacadas: dinheiro na conta que é dos fotógrafos (bruto). */
  aPagarCentavos: number;
  saquesProcessando: number;
  usuariosPorPapel: Record<Papel, number>;
};

export async function resumoGeral(): Promise<ResumoGeral> {
  await connection();
  const pagos = [...pedidos.values()].filter((p) => p.status === "pago");
  const saquesPagos = saques.filter((s) => s.status === "pago");
  const sacados = new Set(saquesPagos.map((s) => s.id));
  const porPapel: Record<Papel, number> = { cliente: 0, fotografo: 0, admin: 0 };
  for (const u of usuarios.values()) porPapel[u.papel]++;
  return {
    entradaCentavos: pagos.reduce((s, p) => s + p.totalCentavos, 0),
    pedidosPagos: pagos.length,
    pedidosPendentes: [...pedidos.values()].filter((p) => p.status === "pendente").length,
    saidaCentavos: saquesPagos.reduce((s, x) => s + x.liquidoCentavos, 0),
    taxasCentavos: saquesPagos.reduce((s, x) => s + x.taxaCentavos, 0),
    aPagarCentavos: lancamentos
      .filter((l) => !l.saqueId || !sacados.has(l.saqueId))
      .reduce((s, l) => s + l.valorCentavos, 0),
    saquesProcessando: saques.filter((s) => s.status === "processando").length,
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
  const sacados = new Set(saques.filter((s) => s.status === "pago").map((s) => s.id));
  return fotografos
    .map((f) => {
      const meus = lancamentos.filter((l) => l.fotografoId === f.id);
      const meusSaques = saques.filter((s) => s.fotografoId === f.id && s.status === "pago");
      return {
        fotografoId: f.id,
        nome: f.nomePublico,
        email: usuarios.get(f.usuarioId)?.email ?? "",
        vendidoCentavos: meus.reduce((s, l) => s + l.valorCentavos, 0),
        sacadoCentavos: meusSaques.reduce((s, x) => s + x.liquidoCentavos, 0),
        taxasCentavos: meusSaques.reduce((s, x) => s + x.taxaCentavos, 0),
        aPagarCentavos: meus
          .filter((l) => !l.saqueId || !sacados.has(l.saqueId))
          .reduce((s, l) => s + l.valorCentavos, 0),
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
};

/** Todos os pedidos, do mais recente para o mais antigo. */
export async function listarPedidosDoAdmin(): Promise<PedidoDoAdmin[]> {
  await connection();
  const nomes = new Map(fotografos.map((f) => [f.id, f.nomePublico]));
  return [...pedidos.values()]
    .map((p) => {
      const itens = itensPorPedido.get(p.id) ?? [];
      return {
        id: p.id,
        criadoEm: p.criadoEm,
        pagoEm: p.pagoEm,
        status: p.status,
        metodo: p.metodo,
        totalCentavos: p.totalCentavos,
        nomeComprador: p.nomeComprador,
        emailComprador: p.emailComprador,
        itens: itens.length,
        fotografos: [...new Set(itens.map((i) => nomes.get(i.fotografoId) ?? "—"))],
        gatewayId: p.gatewayId,
      };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export type SaqueDoAdmin = Saque & { fotografoNome: string };

/** Todos os saques, do mais recente para o mais antigo. */
export async function listarSaquesDoAdmin(): Promise<SaqueDoAdmin[]> {
  await connection();
  const nomes = new Map(fotografos.map((f) => [f.id, f.nomePublico]));
  return saques
    .map((s) => ({ ...structuredClone(s), fotografoNome: nomes.get(s.fotografoId) ?? "—" }))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
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
  return [...usuarios.values()]
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      papel: u.papel,
      temGoogle: u.googleId !== null,
      temSenha: u.senhaHash !== null,
      emailConfirmado: u.emailConfirmadoEm !== null,
      criadoEm: u.criadoEm,
    }))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}
