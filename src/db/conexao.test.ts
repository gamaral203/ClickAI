import { afterEach, describe, expect, it, vi } from "vitest";

import { limparUrl, urlDoBanco, urlParaMigracoes } from "./conexao";

describe("URL do banco", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("tira os parâmetros do pooler que o Postgres recusaria", () => {
    const url = limparUrl(
      "postgres://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x&pgbouncer=true",
    );
    expect(url).toContain("sslmode=require");
    expect(url).not.toContain("supa=");
    expect(url).not.toContain("pgbouncer");
    expect(url).toContain(":6543/postgres");
  });

  it("app usa DATABASE_URL ou POSTGRES_URL; migrações preferem a conexão direta", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_URL", "postgres://pooler");
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "postgres://direta");
    vi.stubEnv("DATABASE_URL_DIRETA", "");
    expect(urlDoBanco()).toBe("postgres://pooler");
    expect(urlParaMigracoes()).toBe("postgres://direta");
    vi.stubEnv("DATABASE_URL", "postgres://minha");
    expect(urlDoBanco()).toBe("postgres://minha");
  });
});
