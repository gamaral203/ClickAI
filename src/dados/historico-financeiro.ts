// Histórico financeiro do fotógrafo (Vendas e saques): uma linha por venda, estorno e
// transferência, com o bruto, a comissão, a taxa de antecipação e o líquido de cada uma. As regras
// (prazos, 8%, 1,99%) são as de src/servicos/financeiro.ts, só cálculo: aqui só se monta a lista.
// A montagem e os filtros são funções puras, para o teste não precisar do banco.

import "server-only";

import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import { diaEmBrasilia } from "@/lib/formatar";
import {
  comissaoDe,
  liberaEm,
  situacaoDoLancamento,
  taxaAntecipacaoDe,
} from "@/servicos/financeiro";

import { paraFotografo } from "./mapas";
import {
  listarLancamentosDoFotografo,
  listarSaquesDoFotografo,
  type LancamentoDoExtrato,
} from "./painel";
import type { FotografoConta, MetodoPagamento, Saque } from "./tipos";

const DIA_MS = 24 * 60 * 60 * 1000;
const ms = (iso: string) => new Date(iso).getTime();

export type StatusDoHistorico =
  | "a_receber"
  | "disponivel"
  | "em_transferencia"
  | "transferido"
  | "estornado"
  /** Saque que falhou: o valor voltou ao saldo. */
  | "nao_realizada";

export const ROTULO_STATUS_HISTORICO: Record<StatusDoHistorico, string> = {
  a_receber: "A receber",
  disponivel: "Disponível",
  em_transferencia: "Em transferência",
  transferido: "Transferido",
  estornado: "Estornado",
  nao_realizada: "Não realizada",
};

type Valores = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxaAntecipacaoCentavos: number;
  liquidoCentavos: number;
};

export type LinhaDeLancamento = Valores & {
  id: string;
  /** Venda (inclui a volta de um estorno, com valor positivo) ou estorno (valor negativo). */
  tipo: "venda" | "estorno";
  /** Data da venda; no estorno de algo já transferido, a data do estorno. */
  data: string;
  eventoTitulo: string;
  metodo: MetodoPagamento;
  /**
   * Ainda sem transferência: comissão e antecipação são as previstas pela configuração atual (a
   * comissão de verdade sai uma vez só, sobre o bruto do saque, e pode diferir em centavos).
   */
  previsto: boolean;
  /** Quando ficou (ou fica) disponível para transferir. */
  disponivelEm: string;
  /** Pix da transferência que levou o lançamento (`pagoEm` do saque); vazio se não caiu ainda. */
  transferidoEm: string | null;
  status: StatusDoHistorico;
};

export type LinhaDeTransferencia = Valores & {
  id: string;
  tipo: "transferencia";
  /** Data do pedido de saque. */
  data: string;
  /** Data do Pix. */
  transferidoEm: string | null;
  status: StatusDoHistorico;
  /** `true` se saiu pela transferência automática; `null` quando não dá para saber. */
  automatica: boolean | null;
};

export type LinhaDoHistorico = LinhaDeLancamento | LinhaDeTransferencia;

/** O valor com o sinal do lançamento: no estorno, comissão e antecipação também voltam. */
function comSinal(valorCentavos: number, taxa: (v: number) => number) {
  const valor = taxa(Math.abs(valorCentavos));
  return valorCentavos < 0 ? -valor : valor;
}

type ContaDoHistorico = Pick<
  FotografoConta,
  "comissaoPct" | "anteciparCartao" | "ultimaTransferenciaAutomaticaEm"
>;

/**
 * Monta o histórico, do mais recente para o mais antigo. Lançamento num saque usa o que de fato
 * aconteceu (antecipação só se o saque cobrou e o cartão entrou antes dos 30 dias); lançamento
 * sem saque usa a previsão pela configuração atual, como o próximo saque calcularia.
 */
export function montarHistorico(
  lancamentos: LancamentoDoExtrato[],
  saques: Saque[],
  conta: ContaDoHistorico,
  agora: number,
): LinhaDoHistorico[] {
  const antecipar = conta.anteciparCartao === true;
  const saquePorId = new Map(saques.map((s) => [s.id, s]));
  const lancamentoPorId = new Map(lancamentos.map((l) => [l.id, l]));
  const desfeitos = new Set(lancamentos.map((l) => l.estornoDe).filter(Boolean));

  const linhas: LinhaDoHistorico[] = lancamentos.map((l) => {
    const tipo = l.valorCentavos < 0 ? "estorno" : "venda";
    // Saque que falhou já devolveu os lançamentos; se sobrar um vínculo, conta como sem saque.
    const saque = l.saqueId ? saquePorId.get(l.saqueId) : undefined;
    const noSaque = saque && saque.status !== "falhou" ? saque : undefined;

    let antecipado: boolean;
    let disponivelEm: string;
    let status: StatusDoHistorico;
    if (noSaque) {
      antecipado =
        l.metodo === "cartao" &&
        noSaque.taxaAntecipacaoCentavos > 0 &&
        ms(noSaque.criadoEm) < ms(l.disponivelEm);
      disponivelEm = l.metodo === "pix" || antecipado ? l.antecipavelEm : l.disponivelEm;
      status = noSaque.status === "pago" ? "transferido" : "em_transferencia";
    } else {
      // O cartão antes dos 30 dias com a antecipação ligada paga 1,99% no próximo saque.
      antecipado = l.metodo === "cartao" && antecipar && ms(l.disponivelEm) > agora;
      disponivelEm = liberaEm(l, antecipar);
      const situacao = situacaoDoLancamento(l, agora, antecipar);
      status =
        situacao === "disponivel" || situacao === "disponivel_antecipado"
          ? "disponivel"
          : "a_receber";
    }
    if (tipo === "estorno" || desfeitos.has(l.id)) status = "estornado";

    // O estorno de algo já transferido nasce com as datas do estorno; senão copia as da venda.
    const original = l.estornoDe ? lancamentoPorId.get(l.estornoDe) : undefined;
    const data =
      original && original.antecipavelEm !== l.antecipavelEm
        ? l.antecipavelEm
        : (l.pagoEm ?? new Date(ms(l.antecipavelEm) - DIA_MS).toISOString());

    const comissaoCentavos = comSinal(l.valorCentavos, (v) => comissaoDe(v, conta.comissaoPct));
    const taxaAntecipacaoCentavos = antecipado ? comSinal(l.valorCentavos, taxaAntecipacaoDe) : 0;
    return {
      id: l.id,
      tipo,
      data,
      eventoTitulo: l.eventoTitulo,
      metodo: l.metodo,
      brutoCentavos: l.valorCentavos,
      comissaoCentavos,
      taxaAntecipacaoCentavos,
      liquidoCentavos: l.valorCentavos - comissaoCentavos - taxaAntecipacaoCentavos,
      previsto: !noSaque,
      disponivelEm,
      transferidoEm: noSaque?.pagoEm ?? null,
      status,
    };
  });

  for (const s of saques) {
    linhas.push({
      id: s.id,
      tipo: "transferencia",
      data: s.criadoEm,
      brutoCentavos: s.brutoCentavos,
      comissaoCentavos: s.comissaoCentavos,
      taxaAntecipacaoCentavos: s.taxaAntecipacaoCentavos,
      liquidoCentavos: s.liquidoCentavos,
      transferidoEm: s.pagoEm,
      status:
        s.status === "pago"
          ? "transferido"
          : s.status === "processando"
            ? "em_transferencia"
            : "nao_realizada",
      // O saque não grava quem o pediu; só a última transferência automática fica registrada
      // na conta, com a mesma hora do saque que ela criou.
      automatica:
        conta.ultimaTransferenciaAutomaticaEm &&
        ms(conta.ultimaTransferenciaAutomaticaEm) === ms(s.criadoEm)
          ? true
          : null,
    });
  }

  return linhas.sort((a, b) => ms(b.data) - ms(a.data));
}

// ---------------------------------------------------------------- Filtros e paginação

export const PERIODOS_HISTORICO = ["7", "30", "90", "mes", "tudo"] as const;
export type PeriodoDoHistorico = (typeof PERIODOS_HISTORICO)[number];
export const ROTULO_PERIODO_HISTORICO: Record<PeriodoDoHistorico, string> = {
  "7": "7 dias",
  "30": "30 dias",
  "90": "90 dias",
  mes: "Este mês",
  tudo: "Tudo",
};

export const TIPOS_HISTORICO = ["todos", "pix", "cartao", "estorno", "transferencia"] as const;
export type TipoDoHistorico = (typeof TIPOS_HISTORICO)[number];
export const ROTULO_TIPO_HISTORICO: Record<TipoDoHistorico, string> = {
  todos: "Todos",
  pix: "Pix",
  cartao: "Cartão",
  estorno: "Estorno",
  transferencia: "Transferência",
};

export const ITENS_POR_PAGINA_HISTORICO = 20;

/** Parâmetros com prefixo `h_`, para não colidir com os outros filtros da página de vendas. */
export const PARAMETROS_HISTORICO = {
  periodo: "h_periodo",
  tipo: "h_tipo",
  pagina: "h_pagina",
} as const;

// Vários valores no mesmo parâmetro (?h_tipo=a&h_tipo=b): vale o primeiro. Valor inválido cai no
// padrão em vez de quebrar a página, porque a URL vem de qualquer um.
const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const esquemaFiltros = z.object({
  [PARAMETROS_HISTORICO.periodo]: z.preprocess(primeiro, z.enum(PERIODOS_HISTORICO)).catch("tudo"),
  [PARAMETROS_HISTORICO.tipo]: z.preprocess(primeiro, z.enum(TIPOS_HISTORICO)).catch("todos"),
  [PARAMETROS_HISTORICO.pagina]: z
    .preprocess(primeiro, z.coerce.number().int().min(1).max(100_000))
    .catch(1),
});

export type FiltrosDoHistorico = {
  periodo: PeriodoDoHistorico;
  tipo: TipoDoHistorico;
  pagina: number;
};

export function lerFiltrosDoHistorico(
  parametros: Record<string, string | string[] | undefined>,
): FiltrosDoHistorico {
  const lido = esquemaFiltros.parse(parametros);
  return {
    periodo: lido[PARAMETROS_HISTORICO.periodo],
    tipo: lido[PARAMETROS_HISTORICO.tipo],
    pagina: lido[PARAMETROS_HISTORICO.pagina],
  };
}

/** Início do período (ms), ou `null` em "tudo". "Este mês" é o mês de Brasília (UTC−3, sem horário de verão). */
export function inicioDoPeriodo(periodo: PeriodoDoHistorico, agora: number): number | null {
  if (periodo === "tudo") return null;
  if (periodo === "mes") {
    const mes = diaEmBrasilia(new Date(agora).toISOString()).slice(0, 7);
    return ms(`${mes}-01T00:00:00-03:00`);
  }
  return agora - Number(periodo) * DIA_MS;
}

function doTipo(linha: LinhaDoHistorico, tipo: TipoDoHistorico) {
  switch (tipo) {
    case "todos":
      return true;
    case "transferencia":
    case "estorno":
      return linha.tipo === tipo;
    case "pix":
    case "cartao":
      return linha.tipo === "venda" && linha.metodo === tipo;
  }
}

export type PaginaDoHistorico = {
  linhas: LinhaDoHistorico[];
  /** Total depois dos filtros. */
  total: number;
  pagina: number;
  paginas: number;
};

/** Aplica período e tipo e corta a página (página além da última mostra a última). */
export function filtrarHistorico(
  linhas: LinhaDoHistorico[],
  filtros: FiltrosDoHistorico,
  agora: number,
  porPagina = ITENS_POR_PAGINA_HISTORICO,
): PaginaDoHistorico {
  const desde = inicioDoPeriodo(filtros.periodo, agora);
  const filtradas = linhas.filter(
    (l) => (desde === null || ms(l.data) >= desde) && doTipo(l, filtros.tipo),
  );
  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const pagina = Math.min(filtros.pagina, paginas);
  return {
    linhas: filtradas.slice((pagina - 1) * porPagina, pagina * porPagina),
    total: filtradas.length,
    pagina,
    paginas,
  };
}

// ---------------------------------------------------------------- Consulta

/**
 * Histórico completo do fotógrafo e a hora usada no cálculo. Não confere os saques no gateway:
 * a página de vendas já faz isso (situacaoFinanceira) antes de mostrar o saldo.
 */
export async function historicoFinanceiroDoFotografo(
  fotografoId: string,
): Promise<{ agora: number; linhas: LinhaDoHistorico[] }> {
  // Espera a requisição antes de ler o banco e o relógio (Cache Components).
  await connection();
  const banco = await obterBanco();
  const [linhaConta, lancamentos, saques] = await Promise.all([
    banco.select().from(t.fotografos).where(eq(t.fotografos.id, fotografoId)),
    listarLancamentosDoFotografo(fotografoId),
    listarSaquesDoFotografo(fotografoId),
  ]);
  const agora = Date.now();
  if (!linhaConta[0]) return { agora, linhas: [] };
  return {
    agora,
    linhas: montarHistorico(lancamentos, saques, paraFotografo(linhaConta[0]), agora),
  };
}
