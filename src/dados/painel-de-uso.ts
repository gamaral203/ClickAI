// Dados do Painel de uso (/admin/uso): assinaturas da plataforma, configurações da gestão,
// contadores anônimos de uso e os números do uso interno. Só a gestão chama estas funções: a
// checagem de papel fica em cada página e ação (exigirGestor). Tudo agregado no banco (count/sum),
// sem trazer linhas para a memória.

import "server-only";

import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  COTACAO_PADRAO_DEZ_MILESIMOS,
  TAXA_CARTAO_PB_PADRAO,
  TAXA_PIX_PB_PADRAO,
  type TaxasDeReferencia,
} from "@/lib/financeiro-plataforma";
import {
  CONFIG,
  CONTADOR,
  hojeEmBrasilia,
  LIMITE_EMAIL_DIA_PADRAO,
  LIMITE_EMAIL_MES_PADRAO,
  type DadosAssinatura,
} from "@/lib/painel-de-uso";

export type Assinatura = DadosAssinatura & {
  id: string;
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

type LinhaAssinatura = typeof t.assinaturas.$inferSelect;

function paraAssinatura(l: LinhaAssinatura): Assinatura {
  return {
    id: l.id,
    nome: l.nome,
    categoria: l.categoria,
    plano: l.plano,
    valorCentavos: l.valorCentavos,
    moeda: l.moeda,
    ciclo: l.ciclo,
    assinadaEm: l.assinadaEm,
    renovaEm: l.renovaEm,
    ativa: l.ativa,
    formaPagamento: l.formaPagamento,
    responsavel: l.responsavel,
    linkPainel: l.linkPainel,
    observacoes: l.observacoes,
    criadoEm: l.criadoEm.toISOString(),
    atualizadoEm: l.atualizadoEm.toISOString(),
  };
}

// ---------------------------------------------------------------- Assinaturas

/** Todas as assinaturas, o próximo vencimento primeiro (sem data de renovação por último). */
export async function listarAssinaturas(): Promise<Assinatura[]> {
  const banco = await obterBanco();
  const linhas = await banco
    .select()
    .from(t.assinaturas)
    .orderBy(sql`${t.assinaturas.renovaEm} asc nulls last`, asc(t.assinaturas.nome));
  return linhas.map(paraAssinatura);
}

export async function buscarAssinatura(id: string): Promise<Assinatura | null> {
  const banco = await obterBanco();
  const [linha] = await banco.select().from(t.assinaturas).where(eq(t.assinaturas.id, id));
  return linha ? paraAssinatura(linha) : null;
}

export async function criarAssinatura(dados: DadosAssinatura, criadoPor: string | null) {
  const banco = await obterBanco();
  const [linha] = await banco
    .insert(t.assinaturas)
    .values({ ...dados, criadoPor })
    .returning({ id: t.assinaturas.id });
  return linha.id;
}

/**
 * Edita a assinatura. Se a data de renovação mudou, os avisos de vencimento voltam a valer
 * (aviso_7d_em e aviso_1d_em zerados). Devolve se a assinatura existia.
 */
export async function atualizarAssinatura(id: string, dados: DadosAssinatura) {
  const banco = await obterBanco();
  const mudouRenovacao = sql`${t.assinaturas.renovaEm} is distinct from ${dados.renovaEm}::date`;
  const linhas = await banco
    .update(t.assinaturas)
    .set({
      ...dados,
      atualizadoEm: sql`now()`,
      aviso7dEm: sql`case when ${mudouRenovacao} then null else ${t.assinaturas.aviso7dEm} end`,
      aviso1dEm: sql`case when ${mudouRenovacao} then null else ${t.assinaturas.aviso1dEm} end`,
    })
    .where(eq(t.assinaturas.id, id))
    .returning({ id: t.assinaturas.id });
  return linhas.length > 0;
}

export async function definirAssinaturaAtiva(id: string, ativa: boolean) {
  const banco = await obterBanco();
  const linhas = await banco
    .update(t.assinaturas)
    .set({ ativa, atualizadoEm: sql`now()` })
    .where(eq(t.assinaturas.id, id))
    .returning({ id: t.assinaturas.id });
  return linhas.length > 0;
}

export async function excluirAssinatura(id: string) {
  const banco = await obterBanco();
  const linhas = await banco
    .delete(t.assinaturas)
    .where(eq(t.assinaturas.id, id))
    .returning({ id: t.assinaturas.id });
  return linhas.length > 0;
}

// ---------------------------------------------------------------- Avisos de vencimento

export type AvisoDeVencimento = Pick<
  Assinatura,
  "id" | "nome" | "plano" | "valorCentavos" | "moeda" | "ciclo" | "formaPagamento"
> & { renovaEm: string; janela: "7d" | "1d" };

/**
 * Reserva os avisos que precisam sair agora, de forma atômica (UPDATE ... WHERE aviso IS NULL
 * RETURNING): duas execuções do job ao mesmo tempo nunca avisam a mesma assinatura duas vezes.
 *   - "1d": ativa e renova hoje ou amanhã (Brasília), sem o aviso de 1 dia. Marca também o de 7
 *     dias, para não sair um "vence em 7 dias" atrasado depois;
 *   - "7d": ativa e renova em até 7 dias, sem o aviso de 7 dias.
 * Assinatura já vencida não gera aviso.
 */
export async function reservarAvisosDeVencimento(
  agora: number = Date.now(),
): Promise<AvisoDeVencimento[]> {
  const banco = await obterBanco();
  const hoje = hojeEmBrasilia(agora);
  const em = (dias: number) => sql`${hoje}::date + ${dias}::int`;
  const momento = new Date(agora);
  const campos = {
    id: t.assinaturas.id,
    nome: t.assinaturas.nome,
    plano: t.assinaturas.plano,
    valorCentavos: t.assinaturas.valorCentavos,
    moeda: t.assinaturas.moeda,
    ciclo: t.assinaturas.ciclo,
    formaPagamento: t.assinaturas.formaPagamento,
    renovaEm: t.assinaturas.renovaEm,
  };
  const umDia = await banco
    .update(t.assinaturas)
    .set({
      aviso1dEm: momento,
      aviso7dEm: sql`coalesce(${t.assinaturas.aviso7dEm}, ${momento.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(t.assinaturas.ativa, true),
        isNull(t.assinaturas.aviso1dEm),
        gte(t.assinaturas.renovaEm, sql`${hoje}::date`),
        lte(t.assinaturas.renovaEm, em(1)),
      ),
    )
    .returning(campos);
  const seteDias = await banco
    .update(t.assinaturas)
    .set({ aviso7dEm: momento })
    .where(
      and(
        eq(t.assinaturas.ativa, true),
        isNull(t.assinaturas.aviso7dEm),
        gte(t.assinaturas.renovaEm, sql`${hoje}::date`),
        lte(t.assinaturas.renovaEm, em(7)),
      ),
    )
    .returning(campos);
  return [
    ...umDia.map((a) => ({ ...a, renovaEm: a.renovaEm!, janela: "1d" as const })),
    ...seteDias.map((a) => ({ ...a, renovaEm: a.renovaEm!, janela: "7d" as const })),
  ];
}

/** O e-mail não saiu: devolve a reserva, para a próxima execução tentar de novo. */
export async function soltarAvisosDeVencimento(avisos: AvisoDeVencimento[]) {
  const banco = await obterBanco();
  for (const a of avisos) {
    await banco
      .update(t.assinaturas)
      .set(a.janela === "1d" ? { aviso1dEm: null } : { aviso7dEm: null })
      .where(eq(t.assinaturas.id, a.id));
  }
}

// ---------------------------------------------------------------- Configurações

export type ConfiguracoesGestao = {
  /** Cotação do dólar em centavos de real (545 = R$ 5,45); `null` se nunca foi digitada. */
  cotacaoUsdCentavos: number | null;
  cotacaoAtualizadaEm: string | null;
  limiteEmailDia: number;
  limiteEmailMes: number;
  /**
   * Cotação de referência com 4 casas (dez-milésimos: 53495 = R$ 5,3495) para as cobranças novas
   * em dólar. Sem a de 4 casas, vem da de centavos; sem nenhuma, a inicial (R$ 5,3495).
   */
  cotacaoDezMilesimos: number;
  taxas: TaxasDeReferencia;
  /** Saldo da conta do Mercado Pago informado à mão, com o dia ("AAAA-MM-DD"); `null` sem. */
  saldoMp: { centavos: number; dia: string; atualizadoEm: string } | null;
};

/** 20261028 → "2026-10-28". */
function diaDoInteiro(v: number) {
  const t = String(v);
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
}

export async function lerConfiguracoesGestao(): Promise<ConfiguracoesGestao> {
  const banco = await obterBanco();
  const linhas = await banco.select().from(t.configuracoesGestao);
  const mapa = new Map(linhas.map((l) => [l.chave, l]));
  const cotacao = mapa.get(CONFIG.cotacaoUsd);
  const precisa = mapa.get(CONFIG.cotacaoUsdPrecisa)?.valor;
  const saldo = mapa.get(CONFIG.saldoMpCentavos);
  const diaSaldo = diaDoInteiro(mapa.get(CONFIG.saldoMpDia)?.valor ?? 0);
  return {
    cotacaoUsdCentavos: cotacao?.valor ?? null,
    cotacaoAtualizadaEm: cotacao?.atualizadoEm.toISOString() ?? null,
    limiteEmailDia: mapa.get(CONFIG.limiteEmailDia)?.valor ?? LIMITE_EMAIL_DIA_PADRAO,
    limiteEmailMes: mapa.get(CONFIG.limiteEmailMes)?.valor ?? LIMITE_EMAIL_MES_PADRAO,
    cotacaoDezMilesimos: precisa ?? (cotacao ? cotacao.valor * 100 : COTACAO_PADRAO_DEZ_MILESIMOS),
    taxas: {
      pixPb: mapa.get(CONFIG.taxaPixPb)?.valor ?? TAXA_PIX_PB_PADRAO,
      cartaoPb: mapa.get(CONFIG.taxaCartaoPb)?.valor ?? TAXA_CARTAO_PB_PADRAO,
    },
    saldoMp:
      saldo && diaSaldo
        ? { centavos: saldo.valor, dia: diaSaldo, atualizadoEm: saldo.atualizadoEm.toISOString() }
        : null,
  };
}

/** Taxas de referência do Mercado Pago (Pix e cartão) para estimar a taxa de um pedido. */
export async function lerTaxasDeReferencia(): Promise<TaxasDeReferencia> {
  return (await lerConfiguracoesGestao()).taxas;
}

/** Grava os valores que mudaram (a data de atualização só muda no que mudou). */
export async function salvarConfiguracoesGestao(
  valores: Partial<Record<(typeof CONFIG)[keyof typeof CONFIG], number>>,
  usuarioId: string,
) {
  const banco = await obterBanco();
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined) continue;
    await banco
      .insert(t.configuracoesGestao)
      .values({ chave, valor, atualizadoPor: usuarioId })
      .onConflictDoUpdate({
        target: t.configuracoesGestao.chave,
        set: { valor, atualizadoPor: usuarioId, atualizadoEm: sql`now()` },
        setWhere: sql`${t.configuracoesGestao.valor} <> ${valor}`,
      });
  }
}

// ---------------------------------------------------------------- Contadores anônimos

/**
 * Soma `quantidade` ao contador do dia (Brasília). Só a chave e o total: nunca quem usou, o destinatário ou
 * a selfie. Uma falha aqui nunca derruba o que está sendo contado.
 */
export async function contarUso(chave: string, quantidade = 1, agora: number = Date.now()) {
  try {
    const banco = await obterBanco();
    await banco
      .insert(t.contadoresUso)
      .values({ dia: hojeEmBrasilia(agora), chave, total: quantidade })
      .onConflictDoUpdate({
        target: [t.contadoresUso.dia, t.contadoresUso.chave],
        set: { total: sql`${t.contadoresUso.total} + ${quantidade}::int` },
      });
  } catch (erro) {
    console.error(`[uso] falha ao contar ${chave}`, erro instanceof Error ? erro.name : "erro");
  }
}

// ---------------------------------------------------------------- Uso interno

export type Periodo = { inicio: string; fim: string; diaInicio: string; diaFim: string };

export type UsoInterno = {
  emails: {
    /** Aceitos pelo Resend (contador): é o que conta no limite do plano. */
    resendHoje: number;
    resendPeriodo: number;
    /** Registrados na caixa de saída (/admin/mensagens), por tipo, no período. */
    caixaPorTipo: { tipo: string; total: number }[];
    caixaHoje: number;
  };
  midia: {
    fotosHoje: number;
    fotosPeriodo: number;
    videosHoje: number;
    videosPeriodo: number;
    processandoAgora: number;
    comErroAgora: number;
  };
  busca: {
    fotosIndexadasPeriodo: number;
    rostosIndexadosPeriodo: number;
    buscasSelfiePeriodo: number;
    /** Dias do período com o contador de buscas ligado (0: sem registro). */
    diasComRegistroBusca: number;
  };
  armazenamento: {
    itens: number;
    /** Soma dos originais com tamanho gravado. */
    bytesOriginaisMedidos: number;
    /** Itens sem o tamanho do original gravado (entram como estimativa). */
    itensSemTamanho: number;
  };
  pedidos: { pagos: number; totalPagoCentavos: number; criados: number };
};

/**
 * Números do uso interno no período (mês em Brasília) e de hoje. Cada tabela é lida uma vez, com
 * `count(*) filter (...)`.
 */
export async function lerUsoInterno(periodo: Periodo, inicioHoje: string, hoje: string) {
  const banco = await obterBanco();
  const ini = sql`${periodo.inicio}::timestamptz`;
  const fim = sql`${periodo.fim}::timestamptz`;
  const desdeHoje = sql`${inicioHoje}::timestamptz`;
  const noPeriodo = (coluna: unknown) => sql`${coluna} >= ${ini} and ${coluna} < ${fim}`;

  const [contadores] = await banco
    .select({
      resendHoje: sql<number>`coalesce(sum(${t.contadoresUso.total}) filter (where ${t.contadoresUso.chave} = ${CONTADOR.emailResend} and ${t.contadoresUso.dia} = ${hoje}::date), 0)::int`,
      resendPeriodo: sql<number>`coalesce(sum(${t.contadoresUso.total}) filter (where ${t.contadoresUso.chave} = ${CONTADOR.emailResend} and ${t.contadoresUso.dia} >= ${periodo.diaInicio}::date and ${t.contadoresUso.dia} < ${periodo.diaFim}::date), 0)::int`,
      buscas: sql<number>`coalesce(sum(${t.contadoresUso.total}) filter (where ${t.contadoresUso.chave} = ${CONTADOR.buscaSelfie} and ${t.contadoresUso.dia} >= ${periodo.diaInicio}::date and ${t.contadoresUso.dia} < ${periodo.diaFim}::date), 0)::int`,
      diasBusca: sql<number>`(count(*) filter (where ${t.contadoresUso.chave} = ${CONTADOR.buscaSelfie} and ${t.contadoresUso.dia} >= ${periodo.diaInicio}::date and ${t.contadoresUso.dia} < ${periodo.diaFim}::date))::int`,
    })
    .from(t.contadoresUso)
    .where(
      and(
        gte(t.contadoresUso.dia, sql`least(${periodo.diaInicio}::date, ${hoje}::date)`),
        lt(t.contadoresUso.dia, sql`greatest(${periodo.diaFim}::date, ${hoje}::date + 1)`),
      ),
    );

  const caixaPorTipo = await banco
    .select({ tipo: t.mensagens.tipo, total: sql<number>`count(*)::int` })
    .from(t.mensagens)
    .where(and(eq(t.mensagens.canal, "email"), sql`${noPeriodo(t.mensagens.criadoEm)}`))
    .groupBy(t.mensagens.tipo)
    .orderBy(sql`count(*) desc`);
  const [caixaHoje] = await banco
    .select({ total: sql<number>`count(*)::int` })
    .from(t.mensagens)
    .where(and(eq(t.mensagens.canal, "email"), sql`${t.mensagens.criadoEm} >= ${desdeHoje}`));

  const pronta = sql`${t.fotos.status} = 'pronta'`;
  const [midia] = await banco
    .select({
      fotosHoje: sql<number>`(count(*) filter (where ${pronta} and ${t.fotos.tipo} = 'foto' and ${t.fotos.criadoEm} >= ${desdeHoje}))::int`,
      fotosPeriodo: sql<number>`(count(*) filter (where ${pronta} and ${t.fotos.tipo} = 'foto' and ${noPeriodo(t.fotos.criadoEm)}))::int`,
      videosHoje: sql<number>`(count(*) filter (where ${pronta} and ${t.fotos.tipo} = 'video' and ${t.fotos.criadoEm} >= ${desdeHoje}))::int`,
      videosPeriodo: sql<number>`(count(*) filter (where ${pronta} and ${t.fotos.tipo} = 'video' and ${noPeriodo(t.fotos.criadoEm)}))::int`,
      processandoAgora: sql<number>`(count(*) filter (where ${t.fotos.status} = 'processando' and ${t.fotos.excluidaEm} is null))::int`,
      comErroAgora: sql<number>`(count(*) filter (where ${t.fotos.status} = 'erro' and ${t.fotos.excluidaEm} is null))::int`,
      fotosIndexadas: sql<number>`(count(*) filter (where ${noPeriodo(t.fotos.rostosIndexadosEm)}))::int`,
      itens: sql<number>`(count(*) filter (where ${t.fotos.chaveOriginal} is not null))::int`,
      bytesMedidos: sql<number>`coalesce(sum(${t.fotos.tamanhoBytes}) filter (where ${t.fotos.chaveOriginal} is not null), 0)::float8`,
      semTamanho: sql<number>`(count(*) filter (where ${t.fotos.chaveOriginal} is not null and ${t.fotos.tamanhoBytes} is null))::int`,
    })
    .from(t.fotos);

  const [rostos] = await banco
    .select({ total: sql<number>`count(*)::int` })
    .from(t.rostos)
    .innerJoin(t.fotos, eq(t.fotos.id, t.rostos.fotoId))
    .where(sql`${noPeriodo(t.fotos.rostosIndexadosEm)}`);

  const [pedidos] = await banco
    .select({
      pagos: sql<number>`(count(*) filter (where ${t.pedidos.status} = 'pago' and ${noPeriodo(t.pedidos.pagoEm)}))::int`,
      totalPago: sql<number>`coalesce(sum(${t.pedidos.totalCentavos}) filter (where ${t.pedidos.status} = 'pago' and ${noPeriodo(t.pedidos.pagoEm)}), 0)::float8`,
      criados: sql<number>`(count(*) filter (where ${noPeriodo(t.pedidos.criadoEm)}))::int`,
    })
    .from(t.pedidos)
    .where(eq(t.pedidos.demonstracao, false));

  const uso: UsoInterno = {
    emails: {
      resendHoje: contadores?.resendHoje ?? 0,
      resendPeriodo: contadores?.resendPeriodo ?? 0,
      caixaPorTipo,
      caixaHoje: caixaHoje?.total ?? 0,
    },
    midia: {
      fotosHoje: midia.fotosHoje,
      fotosPeriodo: midia.fotosPeriodo,
      videosHoje: midia.videosHoje,
      videosPeriodo: midia.videosPeriodo,
      processandoAgora: midia.processandoAgora,
      comErroAgora: midia.comErroAgora,
    },
    busca: {
      fotosIndexadasPeriodo: midia.fotosIndexadas,
      rostosIndexadosPeriodo: rostos?.total ?? 0,
      buscasSelfiePeriodo: contadores?.buscas ?? 0,
      diasComRegistroBusca: contadores?.diasBusca ?? 0,
    },
    armazenamento: {
      itens: midia.itens,
      bytesOriginaisMedidos: Number(midia.bytesMedidos),
      itensSemTamanho: midia.semTamanho,
    },
    pedidos: {
      pagos: pedidos.pagos,
      totalPagoCentavos: Number(pedidos.totalPago),
      criados: pedidos.criados,
    },
  };
  return uso;
}

/** Totais de hoje (Brasília) de algumas chaves de `contadores_uso` (0 nas que não têm linha). */
export async function contadoresDeHoje(
  chaves: readonly string[],
  agora: number = Date.now(),
): Promise<Record<string, number>> {
  const banco = await obterBanco();
  const linhas = chaves.length
    ? await banco
        .select({ chave: t.contadoresUso.chave, total: t.contadoresUso.total })
        .from(t.contadoresUso)
        .where(
          and(
            eq(t.contadoresUso.dia, hojeEmBrasilia(agora)),
            inArray(t.contadoresUso.chave, [...chaves]),
          ),
        )
    : [];
  const totais: Record<string, number> = Object.fromEntries(chaves.map((c) => [c, 0]));
  for (const l of linhas) totais[l.chave] = l.total;
  return totais;
}
