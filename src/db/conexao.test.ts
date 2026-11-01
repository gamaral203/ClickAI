import net from "node:net";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { criarCliente, limparUrl, opcoesTls, urlDoBanco, urlParaMigracoes } from "./conexao";

describe("URL do banco", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("tira os parâmetros do pooler que o Postgres recusaria (o TLS é decidido no código)", () => {
    const url = limparUrl(
      "postgres://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x&pgbouncer=true&application_name=clicouai",
    );
    expect(url).not.toContain("sslmode");
    expect(url).not.toContain("supa=");
    expect(url).not.toContain("pgbouncer");
    expect(url).toContain("application_name=clicouai");
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

describe("TLS do banco", () => {
  const PEM = ["-----BEGIN CERTIFICATE-----", "MIIB", "-----END CERTIFICATE-----"].join("\n");

  it("sem TLS só no Postgres local", () => {
    expect(opcoesTls("postgres://u:s@localhost:5432/db", PEM)).toBe(false);
  });

  it("na nuvem cifra sempre e só confere o certificado com DATABASE_CA_CERT", () => {
    const nuvem = "postgres://u:s@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
    expect(opcoesTls(nuvem, undefined)).toEqual({ rejectUnauthorized: false });
    expect(opcoesTls(nuvem, PEM)).toEqual({ rejectUnauthorized: true, ca: PEM });
    // Em base64 (uma linha, como fica mais fácil de colar na Vercel).
    expect(opcoesTls(nuvem, Buffer.from(PEM).toString("base64"))).toEqual({
      rejectUnauthorized: true,
      ca: PEM,
    });
    // Com as quebras de linha escapadas.
    expect(opcoesTls(nuvem, PEM.split("\n").join("\\n"))).toEqual({
      rejectUnauthorized: true,
      ca: PEM,
    });
  });
});

/** Mensagem do protocolo do Postgres: tipo, tamanho e corpo. */
function mensagem(tipo: string, corpo: Buffer = Buffer.alloc(0)) {
  const cabecalho = Buffer.alloc(5);
  cabecalho.write(tipo, 0, "latin1");
  cabecalho.writeInt32BE(corpo.length + 4, 1);
  return Buffer.concat([cabecalho, corpo]);
}

const pronto = () => mensagem("Z", Buffer.from("I"));
const concluido = () => mensagem("C", Buffer.from("SELECT 0\0"));

/**
 * Postgres de mentira que responde a toda consulta sem linhas, com um atraso, e anota se o
 * cliente mandou outra consulta pela mesma conexão antes da resposta da anterior (pipelining).
 */
async function servidorFalso() {
  let enfileirou = false;
  let consultas = 0;
  const servidor = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let iniciou = false;
    let respondendo = false;
    socket.on("data", (dados) => {
      buffer = Buffer.concat([buffer, dados]);
      if (!iniciou) {
        if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return;
        buffer = buffer.subarray(buffer.readInt32BE(0));
        iniciou = true;
        socket.write(Buffer.concat([mensagem("R", Buffer.alloc(4)), pronto()]));
      }
      while (buffer.length >= 5 && buffer.length >= 1 + buffer.readInt32BE(1)) {
        const tipo = String.fromCharCode(buffer[0]);
        buffer = buffer.subarray(1 + buffer.readInt32BE(1));
        if (tipo === "X") return socket.end();
        if (respondendo) enfileirou = true;
        // Consulta simples (Q) ou o fim de uma estendida (S): responde depois de um tempo.
        const resposta =
          tipo === "Q"
            ? Buffer.concat([concluido(), pronto()])
            : tipo === "S"
              ? Buffer.concat([mensagem("1"), mensagem("2"), mensagem("n"), concluido(), pronto()])
              : null;
        if (!resposta) continue;
        respondendo = true;
        consultas++;
        setTimeout(() => {
          respondendo = false;
          if (!socket.destroyed) socket.write(resposta);
        }, 20);
      }
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const { port } = servidor.address() as net.AddressInfo;
  return {
    url: `postgres://app:senha@127.0.0.1:${port}/app`,
    enfileirou: () => enfileirou,
    consultas: () => consultas,
    fechar: () => new Promise((ok) => servidor.close(ok)),
  };
}

/** Trava o processo como o congelamento da Vercel: nem relógios nem sockets andam nesse tempo. */
function congelar(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

describe("conexão aberta durante o congelamento da instância", () => {
  afterEach(() => vi.restoreAllMocks());

  it("o relógio dispara no descongelamento e derruba a conexão com o Pool comum", async () => {
    // A causa dos erros de produção: banco saudável, e o erro em ~0,1 s depois do descongelamento.
    const servidor = await servidorFalso();
    const pool = new Pool({ connectionString: servidor.url, connectionTimeoutMillis: 50 });
    try {
      const conexao = pool.connect();
      congelar(150);
      await expect(conexao).rejects.toThrow("Connection terminated due to connection timeout");
    } finally {
      await pool.end();
      await servidor.fechar();
    }
  });

  it("criarCliente tenta de novo e a consulta funciona, sem erro para quem pediu", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const servidor = await servidorFalso();
    const cliente = criarCliente(servidor.url, { tempoDeConexaoMs: 50 });
    try {
      const consulta = cliente.query("select 1");
      congelar(150);
      await expect(consulta).resolves.toBeDefined();
      expect(servidor.consultas()).toBe(1);
      expect(console.warn).toHaveBeenCalledOnce();
    } finally {
      await cliente.end();
      await servidor.fechar();
    }
  });

  it("connect() também tenta de novo (é por ele que passam as transações)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const servidor = await servidorFalso();
    const cliente = criarCliente(servidor.url, { tempoDeConexaoMs: 50 });
    try {
      const conexao = cliente.connect();
      congelar(150);
      (await conexao).release();
      expect(console.warn).toHaveBeenCalledOnce();
    } finally {
      await cliente.end();
      await servidor.fechar();
    }
  });

  it("com o banco mudo de verdade, desiste na segunda tentativa", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let conexoes = 0;
    const sockets: net.Socket[] = [];
    const mudo = net.createServer((socket) => {
      conexoes++;
      sockets.push(socket);
      socket.on("error", () => {});
    });
    await new Promise<void>((ok) => mudo.listen(0, "127.0.0.1", ok));
    const { port } = mudo.address() as net.AddressInfo;
    const cliente = criarCliente(`postgres://app:senha@127.0.0.1:${port}/app`, {
      tempoDeConexaoMs: 50,
    });
    try {
      await expect(cliente.connect()).rejects.toThrow("connection timeout");
      expect(conexoes).toBe(2);
    } finally {
      await cliente.end();
      sockets.forEach((socket) => socket.destroy());
      await new Promise((ok) => mudo.close(ok));
    }
  });
});

describe("cliente do banco com o pooler em modo transaction", () => {
  it("não manda uma consulta antes da resposta da anterior na mesma conexão", async () => {
    // O Supavisor trava quando recebe a próxima consulta antes do fim da anterior: era o que o
    // postgres.js fazia com consultas em paralelo, e a página do painel não carregava.
    const servidor = await servidorFalso();
    const cliente = criarCliente(servidor.url, { maximo: 1 });
    try {
      const banco = drizzle({ client: cliente });
      // Com a conexão já aberta, o postgres.js mandava a segunda consulta logo atrás da primeira.
      await banco.execute(sql`select 0`);
      await Promise.all([
        banco.execute(sql`select 1`),
        banco.execute(sql`select ${2}`),
        banco.execute(sql`select ${"três"}`),
        banco.execute(sql`select 4`),
      ]);
      expect(servidor.consultas()).toBe(5);
      expect(servidor.enfileirou()).toBe(false);
    } finally {
      await cliente.end();
      await servidor.fechar();
    }
  });
});
