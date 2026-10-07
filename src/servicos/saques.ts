import "server-only";

import { randomUUID } from "node:crypto";

import {
  listarLancamentosDoFotografo,
  listarSaquesDoFotografo,
  listarSaquesProcessando,
  mudarStatusSaque,
  reservarLancamentosParaSaque,
  soltarLancamentosDoSaque,
  type FotografoConta,
  type Lancamento,
  type Saque,
} from "@/dados";
import { somenteDigitos } from "@/lib/documentos";
import {
  buscarPayout,
  enviarPayoutPix,
  ErroMercadoPago,
  mercadoPagoConfigurado,
  SaqueNaoHabilitado,
  type SituacaoPayout,
} from "@/lib/mercadopago";

// Saque do fotógrafo (docs/arquitetura.md, "Saque do fotógrafo"). O cliente paga na conta da
// plataforma; o fotógrafo saca pelo painel e o dinheiro sai por Pix para o CPF/CNPJ dele, já
// sem a comissão:
//   - saque normal: vendas com 30 dias ou mais, comissão de 10%;
//   - saque antecipado: vendas com 1 dia ou mais; o que ainda não tinha 30 dias paga 10% + 1%.

/** Taxa extra do saque antecipado, em pontos percentuais. */
export const TAXA_ANTECIPACAO_PCT = 1;
/** O Mercado Pago não envia Pix abaixo de R$ 1,00. */
export const SAQUE_MINIMO_CENTAVOS = 100;

export type CalculoSaque = {
  lancamentoIds: string[];
  /** Vendas com 30 dias ou mais: pagam só a comissão. */
  maduroCentavos: number;
  /** Vendas entre 1 e 30 dias, só no saque antecipado: pagam comissão + antecipação. */
  antecipadoCentavos: number;
  brutoCentavos: number;
  taxaCentavos: number;
  liquidoCentavos: number;
};

/** Taxa sobre um valor, arredondada para baixo (o centavo fica com o fotógrafo). */
function taxa(valorCentavos: number, pct: number) {
  return Math.max(0, Math.floor((valorCentavos * pct) / 100));
}

/** Quanto um saque pagaria agora. Recebe só lançamentos ainda sem saque. */
export function calcularSaque(
  lancamentos: Pick<Lancamento, "id" | "valorCentavos" | "disponivelEm" | "antecipavelEm">[],
  agora: number,
  comissaoPct: number,
  antecipado: boolean,
): CalculoSaque {
  const maduros = lancamentos.filter((l) => new Date(l.disponivelEm).getTime() <= agora);
  const antecipados = antecipado
    ? lancamentos.filter(
        (l) =>
          new Date(l.antecipavelEm).getTime() <= agora &&
          new Date(l.disponivelEm).getTime() > agora,
      )
    : [];
  const soma = (lista: typeof lancamentos) => lista.reduce((s, l) => s + l.valorCentavos, 0);
  const maduroCentavos = soma(maduros);
  const antecipadoCentavos = soma(antecipados);
  const taxaCentavos =
    taxa(maduroCentavos, comissaoPct) +
    taxa(antecipadoCentavos, comissaoPct + TAXA_ANTECIPACAO_PCT);
  const brutoCentavos = maduroCentavos + antecipadoCentavos;
  return {
    lancamentoIds: [...maduros, ...antecipados].map((l) => l.id),
    maduroCentavos,
    antecipadoCentavos,
    brutoCentavos,
    taxaCentavos,
    liquidoCentavos: brutoCentavos - taxaCentavos,
  };
}

export type SaldoDoFotografo = {
  /** Vendas com 30 dias ou mais, prontas para o saque normal. */
  disponivelCentavos: number;
  /** Vendas entre 1 e 30 dias: só no saque antecipado. */
  antecipavelCentavos: number;
  /** Vendas de menos de 1 dia: ainda não dá para sacar. */
  aLiberarCentavos: number;
  normal: CalculoSaque;
  antecipado: CalculoSaque;
};

export function calcularSaldo(
  lancamentos: Lancamento[],
  agora: number,
  comissaoPct: number,
): SaldoDoFotografo {
  const livres = lancamentos.filter((l) => l.saqueId === null);
  const normal = calcularSaque(livres, agora, comissaoPct, false);
  const antecipado = calcularSaque(livres, agora, comissaoPct, true);
  const total = livres.reduce((s, l) => s + l.valorCentavos, 0);
  return {
    disponivelCentavos: normal.maduroCentavos,
    antecipavelCentavos: antecipado.antecipadoCentavos,
    aLiberarCentavos: total - antecipado.brutoCentavos,
    normal,
    antecipado,
  };
}

/**
 * O que a página de vendas mostra: saldo, extrato e saques, depois de conferir os saques em
 * processamento. A hora é lida aqui, como o NOW() do banco faria.
 */
export async function situacaoFinanceira(conta: FotografoConta) {
  await conferirSaques(conta.id);
  const [lancamentos, saques] = await Promise.all([
    listarLancamentosDoFotografo(conta.id),
    listarSaquesDoFotografo(conta.id),
  ]);
  const agora = Date.now();
  return {
    agora,
    lancamentos,
    saques,
    saldo: calcularSaldo(lancamentos, agora, conta.comissaoPct),
  };
}

/** A chave Pix confirmada ainda é o CPF/CNPJ atual do cadastro? */
export function chavePixValida(conta: Pick<FotografoConta, "chavePix" | "cpfCnpj">) {
  const documento = somenteDigitos(conta.cpfCnpj);
  return Boolean(conta.chavePix) && conta.chavePix === documento && documento.length >= 11;
}

export type ResultadoSaque =
  | { ok: true; saque: Saque }
  | {
      ok: false;
      motivo: "sem_chave" | "saque_em_andamento" | "abaixo_do_minimo" | "conflito" | "falhou";
    };

/** Aplica ao saque a situação que o Mercado Pago informou. */
async function aplicarSituacao(saqueId: string, situacao: SituacaoPayout, gatewayId: string) {
  if (situacao === "pago") {
    await mudarStatusSaque(saqueId, "processando", "pago", {
      gatewayId,
      pagoEm: new Date().toISOString(),
    });
  } else if (situacao === "falhou") {
    if (await mudarStatusSaque(saqueId, "processando", "falhou", { gatewayId })) {
      await soltarLancamentosDoSaque(saqueId);
    }
  } else {
    await mudarStatusSaque(saqueId, "processando", "processando", { gatewayId });
  }
}

/**
 * Envia (ou reenvia, com a mesma chave de idempotência) o payout de um saque em
 * processamento. Recusa clara do Mercado Pago (4xx) encerra o saque e devolve o saldo; erro de
 * rede ou 5xx deixa em processamento, porque o Pix pode ter saído: a próxima conferência
 * reenvia com a mesma chave e descobre.
 */
async function enviar(saque: Saque) {
  try {
    const { id, situacao } = await enviarPayoutPix({
      saqueId: saque.id,
      liquidoCentavos: saque.liquidoCentavos,
      chavePix: saque.chavePix,
    });
    await aplicarSituacao(saque.id, situacao, id);
  } catch (erro) {
    // Só encerra quando é certo que o Pix não saiu. Timeout, erro de rede, 5xx ou resposta
    // ilegível ficam em processamento.
    const recusado = erro instanceof ErroMercadoPago && erro.status >= 400 && erro.status < 500;
    if (recusado || erro instanceof SaqueNaoHabilitado) {
      console.error("Saque recusado", { saque: saque.id, erro });
      if (await mudarStatusSaque(saque.id, "processando", "falhou")) {
        await soltarLancamentosDoSaque(saque.id);
      }
    } else {
      console.error("Saque sem resposta; fica em processamento", { saque: saque.id, erro });
    }
  }
}

/** Pede o saque de todo o saldo que dá para sacar agora, normal ou antecipado. */
export async function solicitarSaque(
  conta: FotografoConta,
  antecipado: boolean,
): Promise<ResultadoSaque> {
  if (!chavePixValida(conta) || !conta.chavePix) return { ok: false, motivo: "sem_chave" };
  // Um saque por vez: evita somar saldo enquanto outro ainda não terminou.
  if ((await listarSaquesProcessando(conta.id)).length > 0) {
    return { ok: false, motivo: "saque_em_andamento" };
  }

  const lancamentos = await listarLancamentosDoFotografo(conta.id);
  const agora = Date.now();
  const calculo = calcularSaque(
    lancamentos.filter((l) => l.saqueId === null),
    agora,
    conta.comissaoPct,
    antecipado,
  );
  if (calculo.liquidoCentavos < SAQUE_MINIMO_CENTAVOS) {
    return { ok: false, motivo: "abaixo_do_minimo" };
  }

  const saque: Saque = {
    id: randomUUID(),
    fotografoId: conta.id,
    antecipado: antecipado && calculo.antecipadoCentavos > 0,
    brutoCentavos: calculo.brutoCentavos,
    taxaCentavos: calculo.taxaCentavos,
    liquidoCentavos: calculo.liquidoCentavos,
    chavePix: conta.chavePix,
    gatewayId: null,
    status: "processando",
    criadoEm: new Date(agora).toISOString(),
    pagoEm: null,
  };
  if (!(await reservarLancamentosParaSaque(saque, calculo.lancamentoIds))) {
    return { ok: false, motivo: "conflito" };
  }

  if (!mercadoPagoConfigurado()) {
    // Sem credenciais (Parte A): o saque é simulado e sai pago na hora.
    await mudarStatusSaque(saque.id, "processando", "pago", { pagoEm: new Date().toISOString() });
  } else {
    await enviar(saque);
  }
  return { ok: true, saque };
}

/** Confere no Mercado Pago os saques ainda em processamento do fotógrafo. */
export async function conferirSaques(fotografoId: string) {
  if (!mercadoPagoConfigurado()) return;
  for (const saque of await listarSaquesProcessando(fotografoId)) {
    if (!saque.gatewayId) {
      await enviar(saque);
      continue;
    }
    try {
      const { situacao } = await buscarPayout(saque.gatewayId);
      await aplicarSituacao(saque.id, situacao, saque.gatewayId);
    } catch (erro) {
      console.error("Falha ao consultar o saque no Mercado Pago", { saque: saque.id, erro });
    }
  }
}
