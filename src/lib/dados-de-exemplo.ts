// Quando a tela pode mostrar dicas do ambiente de exemplo (contas e senha de exemplo, Pix e
// pagamento simulados). Só no banco de exemplo: o PGlite em memória, usado quando não há
// DATABASE_URL nem POSTGRES_URL (src/db/index.ts), e nunca na produção da Vercel. Com um banco
// de verdade, as contas de exemplo não existem (src/db/semente.ts), e mostrar a senha pública
// seria convite para tentar entrar com ela.
//
// Sem dependências (nem `server-only`): o teste passa o ambiente; as telas usam process.env.

type Ambiente = Record<string, string | undefined>;

/** O app roda no PGlite com os dados de exemplo (sem URL de banco). */
export function rodaNoBancoDeExemplo(env: Ambiente = process.env) {
  return !env.DATABASE_URL && !env.POSTGRES_URL;
}

/** Mostrar contas, senha ou pagamento de exemplo: só no banco de exemplo e fora da produção. */
export function mostrarDadosDeExemplo(env: Ambiente = process.env) {
  return env.VERCEL_ENV !== "production" && rodaNoBancoDeExemplo(env);
}
