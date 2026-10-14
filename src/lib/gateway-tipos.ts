// Tipos comuns aos gateways de pagamento (hoje, o Mercado Pago). Os serviços (pagamentos,
// estornos, saques) só conhecem estes tipos, pela fachada em src/lib/gateway.ts.

/**
 * O que a cobrança diz sobre o dinheiro, lido na API do gateway:
 * - `paga`: o pagamento foi confirmado;
 * - `reembolsada`: devolvida ao comprador;
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
  /** Página do gateway onde o comprador paga, se o gateway usar uma; `null` no Mercado Pago. */
  urlPagamento: string | null;
};

/**
 * Códigos para o log de um erro do gateway: `code`, `error` e `status_detail` em qualquer
 * ponto da resposta (no 402 do Mercado Pago, o motivo vem em
 * `data.transactions.payments[].status_detail`), só os que parecem identificadores. Nunca as
 * mensagens, que podem citar dados do pagador.
 */
export function codigosParaLog(corpo: unknown): string[] {
  const codigos = new Set<string>();
  const visitar = (valor: unknown, nivel: number) => {
    if (!valor || typeof valor !== "object" || nivel > 6) return;
    if (Array.isArray(valor)) {
      valor.slice(0, 10).forEach((v) => visitar(v, nivel + 1));
      return;
    }
    for (const [chave, v] of Object.entries(valor)) {
      if (["code", "error", "status_detail"].includes(chave)) {
        if (typeof v === "string" && /^[\w.-]{1,80}$/.test(v)) codigos.add(v);
      } else visitar(v, nivel + 1);
    }
  };
  visitar(corpo, 0);
  return [...codigos].slice(0, 6);
}

/**
 * Erro HTTP de um gateway. A mensagem leva os códigos da resposta (`codigosParaLog`, ex.:
 * `unauthorized`), para o log mostrar o motivo da recusa. A resposta inteira
 * fica em `corpo`, não enumerável: o console.error(erro) e o Sentry não a imprimem, porque ela
 * pode trazer o CPF/CNPJ do pagador ou a chave Pix do fotógrafo.
 */
export class ErroGateway extends Error {
  declare readonly corpo: unknown;

  constructor(
    readonly status: number,
    corpo: unknown,
    gateway: string,
  ) {
    const codigos = codigosParaLog(corpo);
    super(`${gateway} respondeu ${status}${codigos.length ? ` (${codigos.join(", ")})` : ""}`);
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
