import type {
  FotografoConta,
  FrequenciaTransferencia,
  Lancamento,
  MetodoPagamento,
  Saque,
} from "@/dados/tipos";

// Regras do dinheiro do fotógrafo (docs/arquitetura.md, "Saque do fotógrafo"). Só cálculo, sem
// banco: o saque (src/servicos/saques.ts), o job da transferência automática e as telas usam as
// mesmas funções, então o valor mostrado é o valor sacado.
//
// O cliente paga na conta do ClicouAí no Mercado Pago, que libera Pix e cartão na hora para a
// plataforma. Os prazos abaixo são regra NOSSA (proteção contra estorno e contestação), não do
// gateway, e a "antecipação" do cartão é uma liberação interna do ClicouAí:
//   - Pix: disponível 1 dia depois do pagamento (`antecipavelEm`), sem taxa;
//   - cartão: disponível em 30 dias (`disponivelEm`), sem taxa; com "Antecipar automaticamente
//     vendas no cartão" ligado, 1 dia depois, com 1,99% sobre o bruto do que ainda não tinha 30 dias;
//   - a comissão (8%) sai uma vez só, sobre o bruto de cada saque; o razão (`lancamentos`) fica
//     bruto, então nenhum saldo muda de valor;
//   - estornos são lançamentos negativos e abatem do saque em que entram.
// Taxas arredondadas para baixo: o centavo fica com o fotógrafo.

const DIA_MS = 24 * 60 * 60 * 1000;

/** Taxa da liberação antecipada do cartão, em pontos-base (1,99%): conta inteira, sem float. */
const TAXA_ANTECIPACAO_PB = 199;
/** Taxa da liberação antecipada do cartão, em pontos percentuais. */
export const TAXA_ANTECIPACAO_PCT = TAXA_ANTECIPACAO_PB / 100;
/** "1,99%", para as telas. */
export const TAXA_ANTECIPACAO_TEXTO = `${TAXA_ANTECIPACAO_PCT.toLocaleString("pt-BR")}%`;

/** Os gateways não enviam Pix abaixo de R$ 1,00. */
export const SAQUE_MINIMO_CENTAVOS = 100;

export const FREQUENCIAS_TRANSFERENCIA = [
  "diaria",
  "semanal",
  "mensal",
] as const satisfies readonly FrequenciaTransferencia[];
export const FREQUENCIA_TRANSFERENCIA_PADRAO: FrequenciaTransferencia = "semanal";
/** Intervalo mínimo entre duas transferências automáticas. */
export const INTERVALO_TRANSFERENCIA_MS: Record<FrequenciaTransferencia, number> = {
  diaria: DIA_MS,
  semanal: 7 * DIA_MS,
  mensal: 30 * DIA_MS,
};

export function ehFrequenciaTransferencia(valor: unknown): valor is FrequenciaTransferencia {
  return FREQUENCIAS_TRANSFERENCIA.includes(valor as FrequenciaTransferencia);
}

/** O que o cálculo precisa de um lançamento: o método vem do pedido (listarLancamentosDoFotografo). */
export type LancamentoComMetodo = Pick<
  Lancamento,
  "id" | "valorCentavos" | "disponivelEm" | "antecipavelEm" | "saqueId"
> & { metodo: MetodoPagamento };

/**
 * Situação de um lançamento ainda sem saque, pela configuração atual:
 *   - "disponivel": entra no próximo saque, sem taxa de antecipação;
 *   - "disponivel_antecipado": cartão antes dos 30 dias com a antecipação ligada (1,99%);
 *   - "antecipavel": cartão entre 1 e 30 dias com a antecipação desligada;
 *   - "a_receber": ainda não liberado.
 */
export type SituacaoLancamento =
  "disponivel" | "disponivel_antecipado" | "antecipavel" | "a_receber";

const ms = (iso: string) => new Date(iso).getTime();

export function situacaoDoLancamento(
  l: Pick<LancamentoComMetodo, "metodo" | "disponivelEm" | "antecipavelEm">,
  agora: number,
  anteciparCartao: boolean,
): SituacaoLancamento {
  if (ms(l.disponivelEm) <= agora) return "disponivel";
  if (ms(l.antecipavelEm) > agora) return "a_receber";
  // Pix com 1 dia: sem taxa, inclusive os lançamentos antigos gravados com 30 dias.
  if (l.metodo === "pix") return "disponivel";
  return anteciparCartao ? "disponivel_antecipado" : "antecipavel";
}

/**
 * Quando o lançamento fica (ou ficou) disponível pela configuração atual (ISO): Pix e cartão
 * antecipado no `antecipavelEm`; cartão sem antecipação no `disponivelEm`.
 */
export function liberaEm(
  l: Pick<LancamentoComMetodo, "metodo" | "disponivelEm" | "antecipavelEm">,
  anteciparCartao: boolean,
): string {
  return l.metodo === "pix" || anteciparCartao ? l.antecipavelEm : l.disponivelEm;
}

/** Taxa inteira sobre um valor, arredondada para baixo; nunca negativa. */
function taxaPb(valorCentavos: number, pontosBase: number) {
  return Math.max(0, Math.floor((valorCentavos * pontosBase) / 10_000));
}

/** Comissão sobre um valor (a mesma conta do saque): para mostrar a comissão de cada venda. */
export function comissaoDe(valorCentavos: number, comissaoPct: number) {
  return taxaPb(valorCentavos, comissaoPct * 100);
}

/** Taxa de antecipação sobre o bruto de vendas no cartão liberadas antes dos 30 dias. */
export function taxaAntecipacaoDe(valorCentavos: number) {
  return taxaPb(valorCentavos, TAXA_ANTECIPACAO_PB);
}

export type CalculoSaque = {
  /** Lançamentos que o saque prende. */
  lancamentoIds: string[];
  brutoCentavos: number;
  /** Parte do bruto em cartão liberada antes dos 30 dias (base da taxa de antecipação). */
  antecipadoCentavos: number;
  comissaoCentavos: number;
  taxaAntecipacaoCentavos: number;
  /** Comissão mais antecipação. */
  taxaCentavos: number;
  liquidoCentavos: number;
};

/** Quanto um saque pagaria agora. Recebe só lançamentos ainda sem saque. */
export function calcularSaque(
  lancamentos: LancamentoComMetodo[],
  agora: number,
  comissaoPct: number,
  anteciparCartao: boolean,
): CalculoSaque {
  const lancamentoIds: string[] = [];
  let brutoCentavos = 0;
  let antecipadoCentavos = 0;
  for (const l of lancamentos) {
    const situacao = situacaoDoLancamento(l, agora, anteciparCartao);
    if (situacao !== "disponivel" && situacao !== "disponivel_antecipado") continue;
    lancamentoIds.push(l.id);
    brutoCentavos += l.valorCentavos;
    if (situacao === "disponivel_antecipado") antecipadoCentavos += l.valorCentavos;
  }
  // A comissão sai uma vez só, sobre o bruto do saque (estornos já abatidos).
  const comissaoCentavos = comissaoDe(brutoCentavos, comissaoPct);
  const taxaAntecipacaoCentavos = taxaAntecipacaoDe(antecipadoCentavos);
  const taxaCentavos = comissaoCentavos + taxaAntecipacaoCentavos;
  return {
    lancamentoIds,
    brutoCentavos,
    antecipadoCentavos,
    comissaoCentavos,
    taxaAntecipacaoCentavos,
    taxaCentavos,
    liquidoCentavos: brutoCentavos - taxaCentavos,
  };
}

export type SaldoDoFotografo = CalculoSaque & {
  /** Líquido que dá para transferir agora (o mesmo `liquidoCentavos` do próximo saque). */
  disponivelCentavos: number;
  /** Bruto das vendas ainda sem saque que não entram no próximo saque (inclui as antecipáveis). */
  aReceberCentavos: number;
  /** O líquido estimado do `aReceberCentavos` (só a comissão; a antecipação depende de quando). */
  aReceberLiquidoCentavos: number;
  /** Cartão entre 1 e 30 dias com a antecipação desligada: o bruto... */
  antecipavelCentavos: number;
  /** ...e o líquido que daria se fosse antecipado agora (comissão + 1,99%). */
  antecipavelLiquidoCentavos: number;
};

/** Saldo do fotógrafo: o próximo saque e o que ainda não entra nele. Ignora o que já tem saque. */
export function calcularSaldo(
  lancamentos: LancamentoComMetodo[],
  agora: number,
  comissaoPct: number,
  anteciparCartao: boolean,
): SaldoDoFotografo {
  const livres = lancamentos.filter((l) => l.saqueId === null);
  const proximo = calcularSaque(livres, agora, comissaoPct, anteciparCartao);
  const noSaque = new Set(proximo.lancamentoIds);
  const fora = livres.filter((l) => !noSaque.has(l.id));
  const soma = (lista: LancamentoComMetodo[]) => lista.reduce((s, l) => s + l.valorCentavos, 0);
  const aReceberCentavos = soma(fora);
  const antecipavelCentavos = soma(
    fora.filter((l) => situacaoDoLancamento(l, agora, anteciparCartao) === "antecipavel"),
  );
  return {
    ...proximo,
    disponivelCentavos: proximo.liquidoCentavos,
    aReceberCentavos,
    aReceberLiquidoCentavos: aReceberCentavos - comissaoDe(aReceberCentavos, comissaoPct),
    antecipavelCentavos,
    antecipavelLiquidoCentavos:
      antecipavelCentavos -
      comissaoDe(antecipavelCentavos, comissaoPct) -
      taxaAntecipacaoDe(antecipavelCentavos),
  };
}

export type ResumoFinanceiro = {
  /** Soma de todas as vendas (parte do fotógrafo, bruta), com os estornos abatidos. */
  vendasBrutoCentavos: number;
  /** Comissão dos saques feitos mais a que sairá do saldo ainda sem saque (uma vez só). */
  comissaoCentavos: number;
  /** Taxas de antecipação já cobradas nos saques (processando ou pagos). */
  taxasAntecipacaoCentavos: number;
  /** Vendas menos comissão e antecipação: o que foi ou será do fotógrafo. */
  ganhosLiquidosCentavos: number;
  /** Líquido dos saques pagos. */
  transferidoCentavos: number;
  /** Líquido dos saques pedidos e ainda não pagos (`processando`). */
  pendenteCentavos: number;
};

/**
 * Resumo do painel. Fecha com os saques: ganhos líquidos = transferido + pendente + o líquido do
 * saldo sem saque (só a comissão; a antecipação só conta quando é cobrada). Saque que falhou
 * devolveu os lançamentos e não entra.
 */
export function resumoFinanceiro(
  lancamentos: Pick<Lancamento, "valorCentavos" | "saqueId">[],
  saques: Pick<
    Saque,
    "status" | "comissaoCentavos" | "taxaAntecipacaoCentavos" | "liquidoCentavos"
  >[],
  comissaoPct: number,
): ResumoFinanceiro {
  const vendasBrutoCentavos = lancamentos.reduce((s, l) => s + l.valorCentavos, 0);
  const livres = lancamentos
    .filter((l) => l.saqueId === null)
    .reduce((s, l) => s + l.valorCentavos, 0);
  const validos = saques.filter((s) => s.status !== "falhou");
  const somar = (lista: typeof saques, campo: (s: (typeof saques)[number]) => number) =>
    lista.reduce((total, s) => total + campo(s), 0);
  const comissaoCentavos =
    somar(validos, (s) => s.comissaoCentavos) + comissaoDe(livres, comissaoPct);
  const taxasAntecipacaoCentavos = somar(validos, (s) => s.taxaAntecipacaoCentavos);
  return {
    vendasBrutoCentavos,
    comissaoCentavos,
    taxasAntecipacaoCentavos,
    ganhosLiquidosCentavos: vendasBrutoCentavos - comissaoCentavos - taxasAntecipacaoCentavos,
    transferidoCentavos: somar(
      saques.filter((s) => s.status === "pago"),
      (s) => s.liquidoCentavos,
    ),
    pendenteCentavos: somar(
      saques.filter((s) => s.status === "processando"),
      (s) => s.liquidoCentavos,
    ),
  };
}

type ContaTransferencia = Pick<
  FotografoConta,
  | "transferenciaAutomatica"
  | "frequenciaTransferencia"
  | "transferenciaAutomaticaDesde"
  | "ultimaTransferenciaAutomaticaEm"
>;

/**
 * Quando a próxima transferência automática pode sair (ISO), ou `null` se ela está desligada.
 * Conta da última transferência automática ou de quando foi ligada, o que for mais recente.
 */
export function proximaTransferenciaEm(conta: ContaTransferencia): string | null {
  if (!conta.transferenciaAutomatica) return null;
  const marcos = [conta.ultimaTransferenciaAutomaticaEm, conta.transferenciaAutomaticaDesde]
    .filter((m): m is string => Boolean(m))
    .map(ms);
  // Ligada sem data nenhuma (não acontece pelo painel): pode sair já.
  const base = marcos.length > 0 ? Math.max(...marcos) : 0;
  const intervalo =
    INTERVALO_TRANSFERENCIA_MS[conta.frequenciaTransferencia ?? FREQUENCIA_TRANSFERENCIA_PADRAO];
  return new Date(base + intervalo).toISOString();
}

/** Já passou o intervalo da frequência? */
export function transferenciaVencida(conta: ContaTransferencia, agora: number) {
  const proxima = proximaTransferenciaEm(conta);
  return proxima !== null && ms(proxima) <= agora;
}
