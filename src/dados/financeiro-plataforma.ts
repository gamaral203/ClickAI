// Dados do Financeiro da ClicouAí (/admin/uso/financeiro): pedidos com os lançamentos e saques
// de cada um (para a decomposição em src/lib/financeiro-plataforma.ts), saques e saldo a sacar
// para a conciliação, cobranças das despesas e a importação das despesas iniciais. Só a gestão
// chama estas funções; a checagem de papel fica no serviço e em cada página e ação
// (exigirGestor).
//
// Diferente do resto do painel de uso, aqui as linhas dos pedidos vêm para a memória: a
// decomposição precisa de cada lançamento com o saque dele, e o volume da plataforma (centenas de
// pedidos) cabe com folga. Só leitura, exceto as cobranças e a importação.

import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { obterBanco, type Banco } from "@/db";
import * as t from "@/db/schema";
import type {
  LancamentoParaDecomposicao,
  Metodo,
  PedidoParaDecomposicao,
  StatusCobranca,
  StatusPedido,
} from "@/lib/financeiro-plataforma";
import type { CategoriaAssinatura, Ciclo, Moeda } from "@/lib/painel-de-uso";
import { comissaoDe } from "@/servicos/financeiro";

type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

/** Status que entram no financeiro: pago (receita) e os que já foram pagos e saíram dela. */
const STATUS_COM_PAGAMENTO = ["pago", "estornado", "contestado"] as const;

export type PedidoFinanceiro = PedidoParaDecomposicao & {
  id: string;
  pagoEm: string;
  criadoEm: string;
  subtotalCentavos: number;
  descontoCentavos: number;
  lancamentos: LancamentoParaDecomposicao[];
  /** Um por item: evento e valor do item (preço − desconto), para ratear o pedido por evento. */
  itens: { eventoId: string; eventoTitulo: string; valorCentavos: number }[];
};

/**
 * Pedidos já pagos (pago, estornado ou contestado), fora os de demonstração, com pagamento em
 * [inicio, fim). Sem limites, todos.
 */
export async function listarPedidosFinanceiros(
  intervalo: { inicio?: string; fim?: string } = {},
): Promise<PedidoFinanceiro[]> {
  const banco = await obterBanco();
  const condicoes = [
    eq(t.pedidos.demonstracao, false),
    inArray(t.pedidos.status, [...STATUS_COM_PAGAMENTO]),
    sql`${t.pedidos.pagoEm} is not null`,
  ];
  if (intervalo.inicio) condicoes.push(gte(t.pedidos.pagoEm, new Date(intervalo.inicio)));
  if (intervalo.fim) condicoes.push(lt(t.pedidos.pagoEm, new Date(intervalo.fim)));
  const filtro = and(...condicoes);

  const pedidos = await banco
    .select({
      id: t.pedidos.id,
      status: t.pedidos.status,
      metodo: t.pedidos.metodo,
      subtotalCentavos: t.pedidos.subtotalCentavos,
      descontoCentavos: t.pedidos.descontoCentavos,
      totalCentavos: t.pedidos.totalCentavos,
      acrescimoCartaoCentavos: t.pedidos.acrescimoCartaoCentavos,
      taxaGatewayCentavos: t.pedidos.taxaGatewayCentavos,
      liquidoRecebidoCentavos: t.pedidos.liquidoRecebidoCentavos,
      taxaGatewayOrigem: t.pedidos.taxaGatewayOrigem,
      pagoEm: t.pedidos.pagoEm,
      criadoEm: t.pedidos.criadoEm,
    })
    .from(t.pedidos)
    .where(filtro)
    .orderBy(desc(t.pedidos.pagoEm));
  if (pedidos.length === 0) return [];

  const lancamentos = await banco
    .select({
      pedidoId: t.itensPedido.pedidoId,
      valorCentavos: t.lancamentos.valorCentavos,
      comissaoPctAtual: t.fotografos.comissaoPct,
      saqueStatus: t.saques.status,
      saqueBruto: t.saques.brutoCentavos,
      saqueComissao: t.saques.comissaoCentavos,
      saqueAntecipacao: t.saques.taxaAntecipacaoCentavos,
    })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.lancamentos.fotografoId))
    .leftJoin(t.saques, eq(t.saques.id, t.lancamentos.saqueId))
    .where(filtro);

  const itens = await banco
    .select({
      pedidoId: t.itensPedido.pedidoId,
      eventoId: t.eventos.id,
      eventoTitulo: t.eventos.titulo,
      valorCentavos: sql<number>`(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos})::int`,
    })
    .from(t.itensPedido)
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(filtro);

  const porPedido = new Map<string, PedidoFinanceiro>(
    pedidos.map((p) => [
      p.id,
      {
        ...p,
        status: p.status as StatusPedido,
        metodo: p.metodo as Metodo,
        pagoEm: p.pagoEm!.toISOString(),
        criadoEm: p.criadoEm.toISOString(),
        lancamentos: [],
        itens: [],
      },
    ]),
  );
  for (const l of lancamentos) {
    porPedido.get(l.pedidoId)?.lancamentos.push({
      valorCentavos: l.valorCentavos,
      comissaoPctAtual: l.comissaoPctAtual,
      saque:
        l.saqueStatus && l.saqueBruto !== null
          ? {
              status: l.saqueStatus,
              brutoCentavos: l.saqueBruto,
              comissaoCentavos: l.saqueComissao ?? 0,
              taxaAntecipacaoCentavos: l.saqueAntecipacao ?? 0,
            }
          : null,
    });
  }
  for (const i of itens) {
    porPedido.get(i.pedidoId)?.itens.push({
      eventoId: i.eventoId,
      eventoTitulo: i.eventoTitulo,
      valorCentavos: i.valorCentavos,
    });
  }
  return [...porPedido.values()];
}

// ---------------------------------------------------------------- Detalhe de um pedido

export type DetalhePedidoFinanceiro = {
  pedido: PedidoFinanceiro & {
    gatewayId: string | null;
    estornadoEm: string | null;
    motivoEstorno: string | null;
    contestadoEm: string | null;
    demonstracao: boolean;
  };
  lancamentos: {
    fotografo: string;
    valorCentavos: number;
    estorno: boolean;
    comissaoPctAtual: number;
    saque: {
      id: string;
      status: string;
      brutoCentavos: number;
      comissaoCentavos: number;
      taxaAntecipacaoCentavos: number;
      criadoEm: string;
    } | null;
  }[];
};

/** Um pedido qualquer (em qualquer status) com lançamentos e saques, para a tela do pedido. */
export async function buscarPedidoFinanceiro(id: string): Promise<DetalhePedidoFinanceiro | null> {
  const banco = await obterBanco();
  const [p] = await banco.select().from(t.pedidos).where(eq(t.pedidos.id, id));
  if (!p) return null;
  const linhas = await banco
    .select({
      fotografo: t.fotografos.nomePublico,
      valorCentavos: t.lancamentos.valorCentavos,
      estornoDe: t.lancamentos.estornoDe,
      comissaoPctAtual: t.fotografos.comissaoPct,
      saque: {
        id: t.saques.id,
        status: t.saques.status,
        brutoCentavos: t.saques.brutoCentavos,
        comissaoCentavos: t.saques.comissaoCentavos,
        taxaAntecipacaoCentavos: t.saques.taxaAntecipacaoCentavos,
        criadoEm: t.saques.criadoEm,
      },
    })
    .from(t.lancamentos)
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.lancamentos.fotografoId))
    .leftJoin(t.saques, eq(t.saques.id, t.lancamentos.saqueId))
    .where(eq(t.itensPedido.pedidoId, id));
  const itens = await banco
    .select({
      eventoId: t.eventos.id,
      eventoTitulo: t.eventos.titulo,
      valorCentavos: sql<number>`(${t.itensPedido.precoCentavos} - ${t.itensPedido.descontoCentavos})::int`,
    })
    .from(t.itensPedido)
    .innerJoin(t.fotos, eq(t.fotos.id, t.itensPedido.fotoId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.fotos.eventoId))
    .where(eq(t.itensPedido.pedidoId, id));

  const lancamentos = linhas.map((l) => ({
    fotografo: l.fotografo,
    valorCentavos: l.valorCentavos,
    estorno: l.estornoDe !== null,
    comissaoPctAtual: l.comissaoPctAtual,
    saque: l.saque?.id
      ? {
          id: l.saque.id,
          status: l.saque.status,
          brutoCentavos: l.saque.brutoCentavos,
          comissaoCentavos: l.saque.comissaoCentavos,
          taxaAntecipacaoCentavos: l.saque.taxaAntecipacaoCentavos,
          criadoEm: l.saque.criadoEm.toISOString(),
        }
      : null,
  }));
  return {
    pedido: {
      id: p.id,
      status: p.status,
      metodo: p.metodo,
      subtotalCentavos: p.subtotalCentavos,
      descontoCentavos: p.descontoCentavos,
      totalCentavos: p.totalCentavos,
      acrescimoCartaoCentavos: p.acrescimoCartaoCentavos,
      taxaGatewayCentavos: p.taxaGatewayCentavos,
      liquidoRecebidoCentavos: p.liquidoRecebidoCentavos,
      taxaGatewayOrigem: p.taxaGatewayOrigem,
      pagoEm: (p.pagoEm ?? p.criadoEm).toISOString(),
      criadoEm: p.criadoEm.toISOString(),
      gatewayId: p.gatewayId,
      estornadoEm: p.estornadoEm?.toISOString() ?? null,
      motivoEstorno: p.motivoEstorno,
      contestadoEm: p.contestadoEm?.toISOString() ?? null,
      demonstracao: p.demonstracao,
      itens,
      lancamentos: lancamentos.map((l) => ({
        valorCentavos: l.valorCentavos,
        comissaoPctAtual: l.comissaoPctAtual,
        saque: l.saque
          ? {
              status: l.saque.status,
              brutoCentavos: l.saque.brutoCentavos,
              comissaoCentavos: l.saque.comissaoCentavos,
              taxaAntecipacaoCentavos: l.saque.taxaAntecipacaoCentavos,
            }
          : null,
      })),
    },
    lancamentos,
  };
}

// ---------------------------------------------------------------- Conciliação

export type CaixaAteODia = {
  saquesPagosCentavos: number;
  saquesProcessandoCentavos: number;
  /** Lançamentos sem saque, por fotógrafo, menos a comissão que o saque cobraria (% atual). */
  aSacarFotografosCentavos: number;
};

/** Saques e saldo a sacar dos fotógrafos até o instante `fim` (fora os de demonstração). */
export async function lerCaixaAte(fim: string): Promise<CaixaAteODia> {
  const banco = await obterBanco();
  const ate = sql`${fim}::timestamptz`;
  const [saques] = await banco
    .select({
      pagos: sql<number>`coalesce(sum(${t.saques.liquidoCentavos}) filter (where ${t.saques.status} = 'pago' and coalesce(${t.saques.pagoEm}, ${t.saques.criadoEm}) < ${ate}), 0)::float8`,
      processando: sql<number>`coalesce(sum(${t.saques.liquidoCentavos}) filter (where ${t.saques.status} = 'processando' and ${t.saques.criadoEm} < ${ate}), 0)::float8`,
    })
    .from(t.saques)
    .where(eq(t.saques.demonstracao, false));
  const porFotografo = await banco
    .select({
      bruto: sql<number>`sum(${t.lancamentos.valorCentavos})::float8`,
      pct: t.fotografos.comissaoPct,
    })
    .from(t.lancamentos)
    .innerJoin(t.fotografos, eq(t.fotografos.id, t.lancamentos.fotografoId))
    .innerJoin(t.itensPedido, eq(t.itensPedido.id, t.lancamentos.itemPedidoId))
    .innerJoin(t.pedidos, eq(t.pedidos.id, t.itensPedido.pedidoId))
    .where(
      and(
        isNull(t.lancamentos.saqueId),
        eq(t.fotografos.demonstracao, false),
        eq(t.pedidos.demonstracao, false),
        sql`${t.pedidos.pagoEm} < ${ate}`,
      ),
    )
    .groupBy(t.fotografos.id, t.fotografos.comissaoPct);
  const aSacar = porFotografo.reduce((s, f) => {
    const bruto = Number(f.bruto);
    return s + bruto - comissaoDe(bruto, f.pct);
  }, 0);
  return {
    saquesPagosCentavos: Number(saques.pagos),
    saquesProcessandoCentavos: Number(saques.processando),
    aSacarFotografosCentavos: aSacar,
  };
}

// ---------------------------------------------------------------- Cobranças das despesas

export type CobrancaDespesa = {
  id: string;
  assinaturaId: string;
  assinaturaNome: string;
  categoria: CategoriaAssinatura;
  ciclo: Ciclo;
  data: string;
  valorCentavos: number;
  moeda: Moeda;
  cotacaoDezMilesimos: number | null;
  valorBrlCentavos: number;
  iofCentavos: number;
  status: StatusCobranca;
  pagoPeloSaldoMp: boolean;
  observacao: string;
};

export type DadosCobrancaDespesa = Omit<
  CobrancaDespesa,
  "id" | "assinaturaNome" | "categoria" | "ciclo"
>;

const camposCobranca = {
  id: t.cobrancasDespesa.id,
  assinaturaId: t.cobrancasDespesa.assinaturaId,
  assinaturaNome: t.assinaturas.nome,
  categoria: t.assinaturas.categoria,
  ciclo: t.assinaturas.ciclo,
  data: t.cobrancasDespesa.data,
  valorCentavos: t.cobrancasDespesa.valorCentavos,
  moeda: t.cobrancasDespesa.moeda,
  cotacaoDezMilesimos: t.cobrancasDespesa.cotacaoDezMilesimos,
  valorBrlCentavos: t.cobrancasDespesa.valorBrlCentavos,
  iofCentavos: t.cobrancasDespesa.iofCentavos,
  status: t.cobrancasDespesa.status,
  pagoPeloSaldoMp: t.cobrancasDespesa.pagoPeloSaldoMp,
  observacao: t.cobrancasDespesa.observacao,
};

/** Cobranças com data em [diaInicio, diaFim) (sem limites, todas), da mais antiga à mais nova. */
export async function listarCobrancas(
  intervalo: { diaInicio?: string; diaFim?: string; assinaturaId?: string } = {},
): Promise<CobrancaDespesa[]> {
  const banco = await obterBanco();
  const condicoes = [];
  if (intervalo.diaInicio) condicoes.push(gte(t.cobrancasDespesa.data, intervalo.diaInicio));
  if (intervalo.diaFim) condicoes.push(lt(t.cobrancasDespesa.data, intervalo.diaFim));
  if (intervalo.assinaturaId) {
    condicoes.push(eq(t.cobrancasDespesa.assinaturaId, intervalo.assinaturaId));
  }
  return banco
    .select(camposCobranca)
    .from(t.cobrancasDespesa)
    .innerJoin(t.assinaturas, eq(t.assinaturas.id, t.cobrancasDespesa.assinaturaId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(asc(t.cobrancasDespesa.data), asc(t.cobrancasDespesa.criadoEm));
}

/**
 * Contas a pagar: as cobranças ainda não pagas (pendentes, previstas e provisionadas) de todas as
 * despesas, da data mais antiga à mais nova (as vencidas vêm primeiro).
 */
export async function listarCobrancasEmAberto(): Promise<CobrancaDespesa[]> {
  const banco = await obterBanco();
  return banco
    .select(camposCobranca)
    .from(t.cobrancasDespesa)
    .innerJoin(t.assinaturas, eq(t.assinaturas.id, t.cobrancasDespesa.assinaturaId))
    .where(inArray(t.cobrancasDespesa.status, ["pendente", "prevista", "provisionada"]))
    .orderBy(asc(t.cobrancasDespesa.data), asc(t.cobrancasDespesa.criadoEm));
}

export async function criarCobranca(dados: DadosCobrancaDespesa, criadoPor: string | null) {
  const banco = await obterBanco();
  const [linha] = await banco
    .insert(t.cobrancasDespesa)
    .values({ ...dados, criadoPor })
    .returning({ id: t.cobrancasDespesa.id });
  return linha.id;
}

/** Edita a cobrança, só se ela for da assinatura informada. Devolve se existia. */
export async function atualizarCobranca(id: string, dados: DadosCobrancaDespesa) {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.cobrancasDespesa)
    .set({ ...dados, atualizadoEm: sql`now()` })
    .where(
      and(eq(t.cobrancasDespesa.id, id), eq(t.cobrancasDespesa.assinaturaId, dados.assinaturaId)),
    )
    .returning({ id: t.cobrancasDespesa.id });
  return linhas.length > 0;
}

export async function excluirCobranca(id: string, assinaturaId: string) {
  const banco = await obterBanco();
  const linhas = await banco
    .delete(t.cobrancasDespesa)
    .where(and(eq(t.cobrancasDespesa.id, id), eq(t.cobrancasDespesa.assinaturaId, assinaturaId)))
    .returning({ id: t.cobrancasDespesa.id });
  return linhas.length > 0;
}

/** Quantas cobranças a despesa tem (a exclusão da despesa só vale sem nenhuma). */
export async function contarCobrancas(assinaturaId: string) {
  const banco = await obterBanco();
  const [linha] = await banco
    .select({ total: sql<number>`count(*)::int` })
    .from(t.cobrancasDespesa)
    .where(eq(t.cobrancasDespesa.assinaturaId, assinaturaId));
  return linha?.total ?? 0;
}

// ---------------------------------------------------------------- Armazenamento por evento

export type MidiaDoEvento = {
  eventoId: string;
  fotos: number;
  bytesMedidos: number;
  semTamanho: number;
};

/** Fotos e vídeos com original de cada evento e o tamanho gravado deles. */
export async function midiaDosEventos(eventoIds: string[]): Promise<MidiaDoEvento[]> {
  if (eventoIds.length === 0) return [];
  const banco = await obterBanco();
  const linhas = await banco
    .select({
      eventoId: t.fotos.eventoId,
      fotos: sql<number>`count(*)::int`,
      bytesMedidos: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}), 0)::float8`,
      semTamanho: sql<number>`(count(*) filter (where ${t.fotos.tamanhoBytes} is null))::int`,
    })
    .from(t.fotos)
    .where(and(inArray(t.fotos.eventoId, eventoIds), sql`${t.fotos.chaveOriginal} is not null`))
    .groupBy(t.fotos.eventoId);
  return linhas.map((l) => ({ ...l, bytesMedidos: Number(l.bytesMedidos) }));
}

// ---------------------------------------------------------------- Configurações do financeiro

/** Grava o saldo informado (centavos) e o dia dele (AAAAMMDD), quem informou e quando. */
export async function salvarSaldoInformado(centavos: number, dia: string, usuarioId: string) {
  const banco = await obterBanco();
  const valores: [string, number][] = [
    ["saldo_mp_informado_centavos", centavos],
    ["saldo_mp_informado_dia", Number(dia.replace(/-/g, ""))],
  ];
  await banco.transaction(async (tx) => {
    for (const [chave, valor] of valores) {
      await tx
        .insert(t.configuracoesGestao)
        .values({ chave, valor, atualizadoPor: usuarioId })
        .onConflictDoUpdate({
          target: t.configuracoesGestao.chave,
          set: { valor, atualizadoPor: usuarioId, atualizadoEm: sql`now()` },
        });
    }
  });
}

// ---------------------------------------------------------------- Importação inicial

export type DespesaInicial = {
  chave: string;
  /** Como achar uma já cadastrada à mão (sem a marca da importação). */
  procurar: { categoria: CategoriaAssinatura; nomeContem: string[]; naoContem?: string[] };
  /** Para uma já cadastrada: atualiza os valores (com o motivo em `observacoes`) ou só marca. */
  atualizarExistente: boolean;
  assinatura: {
    nome: string;
    categoria: CategoriaAssinatura;
    plano: string;
    valorCentavos: number;
    moeda: Moeda;
    ciclo: Ciclo;
    assinadaEm: string;
    renovaEm: string | null;
    ativa: boolean;
    observacoes: string;
  };
  cobrancas: (Omit<DadosCobrancaDespesa, "assinaturaId"> & { chave: string })[];
};

export type ResultadoImportacao = {
  item: string;
  despesa: "criada" | "atualizada" | "ja_existia" | "marcada";
  cobrancasNovas: number;
  cobrancasJaExistentes: number;
}[];

async function acharExistente(tx: Transacao, d: DespesaInicial) {
  const [marcada] = await tx
    .select({ id: t.assinaturas.id })
    .from(t.assinaturas)
    .where(eq(t.assinaturas.chaveImportacao, d.chave));
  if (marcada) return { id: marcada.id, marcada: true };
  const candidatas = await tx
    .select({ id: t.assinaturas.id, nome: t.assinaturas.nome })
    .from(t.assinaturas)
    .where(
      and(eq(t.assinaturas.categoria, d.procurar.categoria), isNull(t.assinaturas.chaveImportacao)),
    )
    .orderBy(asc(t.assinaturas.criadoEm));
  const achada = candidatas.find((c) => {
    const nome = c.nome.toLowerCase();
    return (
      d.procurar.nomeContem.some((n) => nome.includes(n)) &&
      !(d.procurar.naoContem ?? []).some((n) => nome.includes(n))
    );
  });
  return achada ? { id: achada.id, marcada: false } : null;
}

/**
 * Importa as despesas iniciais numa transação, de forma idempotente: cada despesa e cada
 * cobrança tem uma chave única (`chave_importacao`); rodar de novo não duplica nada. Uma despesa
 * já cadastrada à mão (achada pela categoria e pelo nome) não é duplicada: recebe a marca e, se
 * `atualizarExistente`, os valores informados, com o motivo nas observações.
 */
export async function importarDespesas(
  despesas: DespesaInicial[],
  usuarioId: string,
): Promise<ResultadoImportacao> {
  const banco = await obterBanco();
  return banco.transaction(async (tx) => {
    const resultado: ResultadoImportacao = [];
    for (const d of despesas) {
      const existente = await acharExistente(tx, d);
      let id: string;
      let situacao: ResultadoImportacao[number]["despesa"];
      if (existente?.marcada) {
        id = existente.id;
        situacao = "ja_existia";
      } else if (existente) {
        id = existente.id;
        if (d.atualizarExistente) {
          const [antes] = await tx.select().from(t.assinaturas).where(eq(t.assinaturas.id, id));
          await tx
            .update(t.assinaturas)
            .set({
              ...d.assinatura,
              observacoes: [antes.observacoes, d.assinatura.observacoes].filter(Boolean).join("\n"),
              chaveImportacao: d.chave,
              atualizadoEm: sql`now()`,
              aviso7dEm: null,
              aviso1dEm: null,
            })
            .where(eq(t.assinaturas.id, id));
          situacao = "atualizada";
        } else {
          await tx
            .update(t.assinaturas)
            .set({ chaveImportacao: d.chave, atualizadoEm: sql`now()` })
            .where(eq(t.assinaturas.id, id));
          situacao = "marcada";
        }
      } else {
        const [nova] = await tx
          .insert(t.assinaturas)
          .values({ ...d.assinatura, chaveImportacao: d.chave, criadoPor: usuarioId })
          .returning({ id: t.assinaturas.id });
        id = nova.id;
        situacao = "criada";
      }
      let novas = 0;
      for (const { chave, ...c } of d.cobrancas) {
        const inseridas = await tx
          .insert(t.cobrancasDespesa)
          .values({ ...c, assinaturaId: id, chaveImportacao: chave, criadoPor: usuarioId })
          .onConflictDoNothing({ target: t.cobrancasDespesa.chaveImportacao })
          .returning({ id: t.cobrancasDespesa.id });
        novas += inseridas.length;
      }
      resultado.push({
        item: d.assinatura.nome,
        despesa: situacao,
        cobrancasNovas: novas,
        cobrancasJaExistentes: d.cobrancas.length - novas,
      });
    }
    return resultado;
  });
}

/** Originais guardados hoje: itens, bytes com tamanho gravado e itens sem tamanho. */
export async function armazenamentoAtual() {
  const banco = await obterBanco();
  const [l] = await banco
    .select({
      itens: sql<number>`count(*)::int`,
      bytesMedidos: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}), 0)::float8`,
      semTamanho: sql<number>`(count(*) filter (where ${t.fotos.tamanhoBytes} is null))::int`,
    })
    .from(t.fotos)
    .where(sql`${t.fotos.chaveOriginal} is not null`);
  return { itens: l.itens, bytesMedidos: Number(l.bytesMedidos), semTamanho: l.semTamanho };
}
