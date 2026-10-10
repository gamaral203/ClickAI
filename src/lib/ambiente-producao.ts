// Variáveis sem as quais a produção não sobe (docs/deploy.md, item 3). Sem o Mercado Pago, o
// app cairia no pagamento e no saque simulados; o código já os recusa em produção, mas o site
// ficaria no ar sem conseguir vender nem confirmar pagamento. Por isso o build de produção falha
// (scripts/migrar.ts, que roda antes do `next build`) e o servidor recusa usar o Mercado Pago
// sem elas (src/lib/mercadopago.ts), no mesmo padrão da guarda do DATABASE_URL
// (src/db/conexao.ts). Só confere se existem: nunca lê nem imprime os valores.
//
// Sem dependências (nem `server-only`): também roda no script de build.

export const VARIAVEIS_MERCADO_PAGO_PRODUCAO = ["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"] as const;

type Ambiente = Record<string, string | undefined>;

/** Nomes das variáveis do Mercado Pago que faltam na produção da Vercel (vazio fora dela). */
export function mercadoPagoFaltandoEmProducao(env: Ambiente = process.env): string[] {
  if (env.VERCEL_ENV !== "production") return [];
  return VARIAVEIS_MERCADO_PAGO_PRODUCAO.filter((nome) => !env[nome]);
}

/** O que falta do gateway, para o build de produção (scripts/migrar.ts). */
export function pagamentoFaltandoEmProducao(env: Ambiente = process.env): string[] {
  return mercadoPagoFaltandoEmProducao(env);
}

export function erroMercadoPagoEmProducao(faltando: string[]) {
  return (
    `${faltando.join(" e ")} não configurada(s) em produção: sem o Mercado Pago o site não ` +
    "cobra nem confirma pagamentos. Cadastre na Vercel (Production) e faça o deploy de novo. " +
    "Veja docs/deploy.md."
  );
}
