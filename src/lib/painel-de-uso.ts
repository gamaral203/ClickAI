// Contas do Painel de uso (/admin/uso), sem banco: valores das assinaturas por mês e por ano,
// conversão do dólar pela cotação digitada pela gestão, "vence em N dias" no horário de Brasília,
// validação do formulário e a estimativa de custo do R2. Tudo em centavos (inteiro).

import { z } from "zod";

import { reaisParaCentavos } from "./dinheiro";

export const CATEGORIAS_ASSINATURA = [
  "hospedagem",
  "banco",
  "armazenamento",
  "email",
  "ia",
  "dominio",
  "pagamentos",
  "marketing",
  "outros",
] as const;
export type CategoriaAssinatura = (typeof CATEGORIAS_ASSINATURA)[number];

export const ROTULO_CATEGORIA: Record<CategoriaAssinatura, string> = {
  hospedagem: "Hospedagem",
  banco: "Banco de dados",
  armazenamento: "Armazenamento",
  email: "E-mail",
  ia: "IA",
  dominio: "Domínio",
  pagamentos: "Pagamentos",
  marketing: "Marketing",
  outros: "Outros",
};

export type Moeda = "BRL" | "USD";
export type Ciclo = "mensal" | "anual" | "uso" | "avulsa";

export const ROTULO_CICLO: Record<Ciclo, string> = {
  mensal: "por mês",
  anual: "por ano",
  uso: "por uso (estimado/mês)",
  avulsa: "avulsa (sem recorrência)",
};

/** Chaves de `configuracoes_gestao`. */
export const CONFIG = {
  cotacaoUsd: "cotacao_usd_centavos",
  /**
   * Cotação de referência com 4 casas (dez-milésimos de real: 53495 = R$ 5,3495), usada nas
   * cobranças novas em dólar (src/lib/financeiro-plataforma.ts). Salva junto com a de centavos.
   */
  cotacaoUsdPrecisa: "cotacao_usd_dez_milesimos",
  /** Taxas de referência do Mercado Pago, em pontos-base (99 = 0,99%), para estimar a taxa. */
  taxaPixPb: "taxa_mp_pix_pb",
  taxaCartaoPb: "taxa_mp_cartao_pb",
  /** Saldo da conta do Mercado Pago informado à mão (centavos) e o dia dele (AAAAMMDD). */
  saldoMpCentavos: "saldo_mp_informado_centavos",
  saldoMpDia: "saldo_mp_informado_dia",
  limiteEmailDia: "limite_email_dia",
  limiteEmailMes: "limite_email_mes",
} as const;

/** Plano gratuito do Resend (padrão até a gestão mudar). */
export const LIMITE_EMAIL_DIA_PADRAO = 100;
export const LIMITE_EMAIL_MES_PADRAO = 3000;
/** Acima disto do limite, o painel acende o alerta. */
export const FRACAO_ALERTA = 0.8;

/** Chaves de `contadores_uso`. */
export const CONTADOR = {
  emailResend: "email_resend",
  buscaSelfie: "busca_selfie",
  /** Coleções consultadas pela busca por rosto do painel do fotógrafo (uma chamada cada). */
  buscaRostoPainel: "busca_rosto_painel",
} as const;

// ---------------------------------------------------------------- Valores

type ValorAssinatura = { valorCentavos: number; moeda: Moeda; ciclo: Ciclo };

/**
 * Quanto pesa por mês: anual/12 (arredondado); mensal e "por uso" (estimativa mensal) inteiros.
 * Avulsa não se repete: zero (o gasto dela fica só nas cobranças).
 */
export function valorMensal(a: Pick<ValorAssinatura, "valorCentavos" | "ciclo">) {
  if (a.ciclo === "avulsa") return 0;
  return a.ciclo === "anual" ? Math.round(a.valorCentavos / 12) : a.valorCentavos;
}

/** Quanto pesa por ano: mensal e "por uso" ×12; anual inteiro; avulsa zero. */
export function valorAnual(a: Pick<ValorAssinatura, "valorCentavos" | "ciclo">) {
  if (a.ciclo === "avulsa") return 0;
  return a.ciclo === "anual" ? a.valorCentavos : a.valorCentavos * 12;
}

/** Centavos de dólar → centavos de real, pela cotação em centavos (545 = R$ 5,45 por US$ 1). */
export function dolarParaReal(centavosUsd: number, cotacaoCentavos: number) {
  return Math.round((centavosUsd * cotacaoCentavos) / 100);
}

export type ResumoGastos = {
  /** Mensal: só o que é cobrado em reais. */
  mensalBrl: number;
  /** Mensal: só o que é cobrado em dólares (centavos de dólar). */
  mensalUsd: number;
  /** Mensal total em reais, com o dólar convertido; `null` sem cotação e com algo em dólar. */
  mensalTotalBrl: number | null;
  anualBrl: number;
  anualUsd: number;
  anualTotalBrl: number | null;
  ativas: number;
};

/** Soma das assinaturas ATIVAS; as inativas não entram. */
export function resumirGastos(
  lista: (ValorAssinatura & { ativa: boolean })[],
  cotacaoCentavos: number | null,
): ResumoGastos {
  const ativas = lista.filter((a) => a.ativa);
  const soma = (moeda: Moeda, f: (a: ValorAssinatura) => number) =>
    ativas.filter((a) => a.moeda === moeda).reduce((s, a) => s + f(a), 0);
  const mensalBrl = soma("BRL", valorMensal);
  const mensalUsd = soma("USD", valorMensal);
  const anualBrl = soma("BRL", valorAnual);
  const anualUsd = soma("USD", valorAnual);
  const total = (brl: number, usd: number) =>
    usd === 0 ? brl : cotacaoCentavos ? brl + dolarParaReal(usd, cotacaoCentavos) : null;
  return {
    mensalBrl,
    mensalUsd,
    mensalTotalBrl: total(mensalBrl, mensalUsd),
    anualBrl,
    anualUsd,
    anualTotalBrl: total(anualBrl, anualUsd),
    ativas: ativas.length,
  };
}

const dolares = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 1990 em BRL → "R$ 19,90"; em USD → "US$ 19.90". */
export function formatarMoeda(centavos: number, moeda: Moeda) {
  return moeda === "USD"
    ? `US${dolares.format(centavos / 100)}`
    : reais.format(centavos / 100).replace(/ /g, " ");
}

// ---------------------------------------------------------------- Datas (Brasília)

const FUSO = "America/Sao_Paulo";

/** Hoje em Brasília, "AAAA-MM-DD". */
export function hojeEmBrasilia(agora: number = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(agora));
}

/** Dias de calendário de `de` até `ate` ("AAAA-MM-DD"), sem passar pelo fuso do servidor. */
export function diasEntre(de: string, ate: string) {
  const ms = (d: string) => {
    const [a, m, dia] = d.split("-").map(Number);
    return Date.UTC(a, m - 1, dia);
  };
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
}

/** Dias até a renovação, contados no calendário de Brasília (0 = vence hoje, negativo = venceu). */
export function diasParaVencer(renovaEm: string, agora: number = Date.now()) {
  return diasEntre(hojeEmBrasilia(agora), renovaEm);
}

/** "vence hoje", "vence amanhã", "vence em 5 dias", "venceu há 2 dias". */
export function textoDoVencimento(dias: number) {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
}

/** "2026-10-07" → "07/10/2026", sem passar por fuso. */
export function formatarDia(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Período do painel de uso em Brasília: o mês atual (até agora) ou o anterior inteiro. `inicio` e
 * `fim` são instantes ISO (fim exclusivo); `diaInicio`/`diaFim` servem para a coluna `date` dos
 * contadores (fim exclusivo).
 */
export function periodoDoMes(qual: "atual" | "anterior", agora: number = Date.now()) {
  const hoje = hojeEmBrasilia(agora);
  let [ano, mes] = hoje.split("-").map(Number);
  if (qual === "anterior") {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  const proximo = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  const dia = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}-01`;
  const diaInicio = dia(ano, mes);
  const diaFim = dia(proximo.ano, proximo.mes);
  const rotulo = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ano, mes - 1, 15)));
  return {
    diaInicio,
    diaFim,
    inicio: `${diaInicio}T00:00:00-03:00`,
    fim: `${diaFim}T00:00:00-03:00`,
    hoje,
    inicioHoje: `${hoje}T00:00:00-03:00`,
    rotulo,
  };
}

// ---------------------------------------------------------------- Formulário

/** Doze dígitos ou mais seguidos (com espaço, ponto ou hífen no meio): parece número de cartão. */
export function pareceNumeroDeCartao(texto: string) {
  return /\d{12,}/.test(texto.replace(/[\s.\-_/]/g, ""));
}

const MENSAGEM_CARTAO =
  "Não guarde o número do cartão: escreva só a bandeira e o final (ex.: Mastercard final 9292).";

const textoSemCartao = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .refine((v) => !pareceNumeroDeCartao(v), MENSAGEM_CARTAO);

const diaValido = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
};

/** Link do painel do serviço: só https, com um domínio de verdade. */
export function linkHttpsValido(valor: string) {
  try {
    const u = new URL(valor);
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password;
  } catch {
    return false;
  }
}

export const formularioAssinatura = z.object({
  assinaturaId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  nome: textoSemCartao(80).pipe(z.string().min(1, "Informe o nome do serviço.")),
  categoria: z.enum(CATEGORIAS_ASSINATURA, "Escolha a categoria."),
  plano: textoSemCartao(80),
  valor: z.string().trim().min(1, "Informe o valor."),
  moeda: z.enum(["BRL", "USD"], "Escolha a moeda."),
  ciclo: z.enum(["mensal", "anual", "uso", "avulsa"], "Escolha o ciclo."),
  assinadaEm: z.string().refine(diaValido, "Informe a data em que foi assinada."),
  renovaEm: z
    .string()
    .refine((v) => v === "" || diaValido(v), "Informe uma data válida ou deixe em branco."),
  formaPagamento: textoSemCartao(60),
  responsavel: textoSemCartao(60),
  linkPainel: z
    .string()
    .trim()
    .max(300, "Use um link mais curto.")
    .refine((v) => v === "" || linkHttpsValido(v), "Use um link https:// válido."),
  observacoes: textoSemCartao(500),
});

export type CampoAssinatura = Exclude<keyof z.infer<typeof formularioAssinatura>, "assinaturaId">;

export type DadosAssinatura = {
  nome: string;
  categoria: CategoriaAssinatura;
  plano: string;
  valorCentavos: number;
  moeda: Moeda;
  ciclo: Ciclo;
  assinadaEm: string;
  renovaEm: string | null;
  formaPagamento: string;
  responsavel: string;
  linkPainel: string | null;
  observacoes: string;
};

/** Teto de um valor: US$/R$ 1.000.000,00. */
const VALOR_MAXIMO = 100_000_000;

/** Valida o formulário (campos em texto) e devolve os dados em centavos, ou o erro de cada campo. */
export function validarAssinatura(
  entrada: Record<string, unknown>,
):
  | { ok: true; id: string | undefined; dados: DadosAssinatura }
  | { ok: false; erros: Partial<Record<CampoAssinatura, string>> } {
  const r = formularioAssinatura.safeParse({
    plano: "",
    renovaEm: "",
    formaPagamento: "",
    responsavel: "",
    linkPainel: "",
    observacoes: "",
    ...entrada,
  });
  if (!r.success) {
    const erros: Partial<Record<CampoAssinatura, string>> = {};
    for (const p of r.error.issues) erros[p.path[0] as CampoAssinatura] ??= p.message;
    return { ok: false, erros };
  }
  const d = r.data;
  const valorCentavos = reaisParaCentavos(d.valor);
  if (valorCentavos === null || valorCentavos > VALOR_MAXIMO) {
    return { ok: false, erros: { valor: "Informe um valor como 19,90 (ou 0 se for grátis)." } };
  }
  if (d.renovaEm && d.renovaEm < d.assinadaEm) {
    return { ok: false, erros: { renovaEm: "A renovação não pode ser antes da assinatura." } };
  }
  return {
    ok: true,
    id: d.assinaturaId,
    dados: {
      nome: d.nome,
      categoria: d.categoria,
      plano: d.plano,
      valorCentavos,
      moeda: d.moeda,
      ciclo: d.ciclo,
      assinadaEm: d.assinadaEm,
      renovaEm: d.renovaEm || null,
      formaPagamento: d.formaPagamento,
      responsavel: d.responsavel,
      linkPainel: d.linkPainel || null,
      observacoes: d.observacoes,
    },
  };
}

// ---------------------------------------------------------------- Armazenamento (R2)

/** Faixa grátis do R2 e preço acima dela (US$ 0,015 por GB por mês). */
export const R2_GB_GRATIS = 10;
export const R2_CENTAVOS_USD_POR_GB_X1000 = 1500; // 1,5 centavo de dólar por GB = 1500 milésimos
/**
 * Tamanho médio estimado do que fica no bucket público por item (prévia com marca + miniatura):
 * não há coluna com o tamanho deles.
 */
export const BYTES_PREVIA_ESTIMADA = 350 * 1024;
/** Original sem tamanho gravado (fotos antigas): média estimada. */
export const BYTES_ORIGINAL_ESTIMADO = 8 * 1024 * 1024;

const GB = 1024 ** 3;

/** Custo mensal estimado do R2 em centavos de dólar (arredondado para cima). */
export function custoR2CentavosUsd(bytes: number) {
  const gbPagos = Math.max(0, bytes / GB - R2_GB_GRATIS);
  return Math.ceil((gbPagos * R2_CENTAVOS_USD_POR_GB_X1000) / 1000);
}

/** Fração usada de um limite (0 a 1+); limite zero ou ausente → 0. */
export function fracaoDoLimite(usado: number, limite: number) {
  return limite > 0 ? usado / limite : 0;
}
