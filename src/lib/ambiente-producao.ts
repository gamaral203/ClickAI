// Variáveis sem as quais a produção não sobe (docs/deploy.md, item 3). Sem um gateway de
// pagamento, o app cairia no pagamento e no saque simulados; o código já os recusa em produção,
// mas o site ficaria no ar sem conseguir vender nem confirmar pagamento. Por isso o build de
// produção falha (scripts/migrar.ts, que roda antes do `next build`) e o servidor recusa usar o
// gateway sem elas (src/lib/mercadopago.ts e src/lib/asaas.ts), no mesmo padrão da guarda do
// DATABASE_URL (src/db/conexao.ts). Só confere se existem: nunca lê nem imprime os valores.
//
// O gateway é o Asaas quando ASAAS_API_KEY existe; senão, o Mercado Pago.
//
// Sem dependências (nem `server-only`): também roda no script de build.

export const VARIAVEIS_MERCADO_PAGO_PRODUCAO = ["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"] as const;
export const VARIAVEIS_ASAAS_PRODUCAO = ["ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"] as const;

type Ambiente = Record<string, string | undefined>;

/** Com ASAAS_API_KEY, o pagamento é pelo Asaas (src/lib/gateway.ts). */
export function usaAsaas(env: Ambiente = process.env) {
  return Boolean(env.ASAAS_API_KEY);
}

/** Nomes das variáveis do Mercado Pago que faltam na produção da Vercel (vazio fora dela). */
export function mercadoPagoFaltandoEmProducao(env: Ambiente = process.env): string[] {
  if (env.VERCEL_ENV !== "production" || usaAsaas(env)) return [];
  return VARIAVEIS_MERCADO_PAGO_PRODUCAO.filter((nome) => !env[nome]);
}

/** Nomes das variáveis do Asaas que faltam na produção (só quando o Asaas está em uso). */
export function asaasFaltandoEmProducao(env: Ambiente = process.env): string[] {
  if (env.VERCEL_ENV !== "production" || !usaAsaas(env)) return [];
  return VARIAVEIS_ASAAS_PRODUCAO.filter((nome) => !env[nome]);
}

/** O que falta do gateway em uso, para o build de produção (scripts/migrar.ts). */
export function pagamentoFaltandoEmProducao(env: Ambiente = process.env): string[] {
  return [...mercadoPagoFaltandoEmProducao(env), ...asaasFaltandoEmProducao(env)];
}

export function erroMercadoPagoEmProducao(faltando: string[]) {
  return (
    `${faltando.join(" e ")} não configurada(s) em produção: sem o gateway de pagamento o site ` +
    "não cobra nem confirma pagamentos. Cadastre na Vercel (Production) e faça o deploy de " +
    "novo. Veja docs/deploy.md."
  );
}
