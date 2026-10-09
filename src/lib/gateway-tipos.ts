// Tipos comuns aos gateways de pagamento (Mercado Pago e Asaas). Os serviços (pagamentos,
// estornos, saques) só conhecem estes tipos, pela fachada em src/lib/gateway.ts.

/**
 * O que a cobrança diz sobre o dinheiro, lido na API do gateway:
 * - `paga`: o pagamento foi confirmado;
 * - `reembolsada`: devolvida ao comprador (inclusive chargeback perdido, no Asaas);
 * - `contestada`: chargeback aberto ou em disputa;
 * - `contestacao_perdida`: disputa encerrada contra a plataforma (Mercado Pago);
 * - `outra`: o resto (aguardando pagamento, recusada, vencida...).
 */
export type SituacaoCobranca =
  "paga" | "reembolsada" | "contestada" | "contestacao_perdida" | "outra";

export type Cobranca = {
  id: string;
  status: string;
  statusDetalhe: string | null;
  /** O id do pedido, gravado na cobrança ao criar. */
  referencia: string | null;
  totalCentavos: number | null;
  /** Confirmada: o pedido pode ser liberado. */
  paga: boolean;
  situacao: SituacaoCobranca;
  /** Não vai mais virar paga (vencida, cancelada, recusada, reembolsada). */
  encerrada: boolean;
  pix: { copiaECola: string; qrCodeBase64: string } | null;
  /** Página do gateway onde o comprador paga (cartão no Asaas); `null` no Mercado Pago. */
  urlPagamento: string | null;
};

/**
 * Erro HTTP de um gateway. A resposta fica em `corpo`, não enumerável: o console.error(erro) e o
 * Sentry não a imprimem, porque ela pode trazer o CPF/CNPJ do pagador ou a chave Pix do fotógrafo.
 */
export class ErroGateway extends Error {
  declare readonly corpo: unknown;

  constructor(
    readonly status: number,
    corpo: unknown,
    gateway: string,
  ) {
    super(`${gateway} respondeu ${status}`);
    Object.defineProperty(this, "corpo", { value: corpo, enumerable: false });
  }
}

/**
 * - `pago`: o Pix chegou ao fotógrafo;
 * - `falhou`: o gateway informou que não saiu; o saldo volta ao fotógrafo;
 * - `revisao`: saiu e voltou; alguém precisa olhar;
 * - `processando`: todo o resto, inclusive status desconhecido.
 */
export type SituacaoPayout = "processando" | "pago" | "falhou" | "revisao";

export type ResultadoPayout = {
  id: string;
  transacaoId: string | null;
  situacao: SituacaoPayout;
  status: string | null;
  detalhe: string | null;
};

/** O saque nem foi enviado ao gateway: falta configurar ou liberar o saque em produção. */
export class SaqueNaoHabilitado extends Error {
  constructor(motivo: string) {
    super(`Saque em produção não habilitado: ${motivo}`);
  }
}

/** Lê os códigos e mensagens de erro de qualquer formato de resposta dos gateways. */
export function textosDoErro(corpo: unknown): { codigos: string[]; mensagens: string[] } {
  const codigos: string[] = [];
  const mensagens: string[] = [];
  const visitar = (valor: unknown) => {
    if (!valor || typeof valor !== "object") return;
    const o = valor as Record<string, unknown>;
    for (const chave of ["code", "error"]) {
      if (typeof o[chave] === "string") codigos.push((o[chave] as string).toLowerCase());
    }
    for (const chave of ["message", "description", "details"]) {
      if (typeof o[chave] === "string") mensagens.push(o[chave] as string);
    }
    for (const chave of ["errors", "cause"]) {
      if (Array.isArray(o[chave])) (o[chave] as unknown[]).forEach(visitar);
    }
  };
  visitar(corpo);
  return { codigos, mensagens };
}
