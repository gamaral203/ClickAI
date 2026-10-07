// Conexão com o Postgres, comum ao app (src/db/index.ts) e ao script de migração. Serve para o
// Supabase (padrão) e para qualquer Postgres. Driver: postgres.js.
//
// URLs, em ordem de preferência:
// - App: DATABASE_URL ou POSTGRES_URL (a integração do Supabase com a Vercel cria esta). No
//   Supabase, é a URL do pooler em modo transaction (porta 6543), a que aguenta as funções da
//   Vercel abrindo conexões (docs/riscos.md, prioridade alta).
// - Migrações: DATABASE_URL_DIRETA ou POSTGRES_URL_NON_POOLING (conexão direta, melhor para
//   mudar o schema); sem elas, a mesma URL do app.

import postgres from "postgres";

/** Parâmetros da URL que o Postgres entende; os outros (ex.: `supa=…` do Supabase) saem. */
const PARAMETROS_ACEITOS = new Set(["sslmode", "application_name", "connect_timeout", "options"]);

/**
 * Tira da URL os parâmetros que só o pooler ou a plataforma usam: o postgres.js repassaria cada
 * um ao servidor como configuração, e o Postgres recusaria a conexão.
 */
export function limparUrl(url: string) {
  const u = new URL(url);
  for (const chave of [...u.searchParams.keys()]) {
    if (!PARAMETROS_ACEITOS.has(chave)) u.searchParams.delete(chave);
  }
  return u.toString();
}

export function urlDoBanco(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

export function urlParaMigracoes(): string | null {
  return process.env.DATABASE_URL_DIRETA || process.env.POSTGRES_URL_NON_POOLING || urlDoBanco();
}

/**
 * Cliente do postgres.js. `prepare: false` porque o pooler do Supabase em modo transaction não
 * guarda prepared statements entre transações. Poucas conexões por instância: na Vercel são
 * muitas instâncias, e quem segura o total é o pooler.
 */
export function criarCliente(url: string, { maximo = 5 }: { maximo?: number } = {}) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(limparUrl(url), {
    prepare: false,
    max: maximo,
    idle_timeout: 20,
    connect_timeout: 15,
    // Banco na nuvem: sempre com TLS. Local (Postgres na própria máquina): sem.
    ssl: local ? false : "require",
  });
}
