// Aplica as migrações no banco (Supabase ou outro Postgres) e, se ele estiver vazio, grava os
// dados de exemplo (na produção, só o necessário: ver src/db/semente.ts). Roda antes do
// `next build` (inclusive na Vercel). Sem URL de banco, não faz nada: o app usa o PGlite em
// memória, que se migra sozinho. Na produção da Vercel, sem URL, o build falha.
//
// Na falha, nunca usar process.exit(1) logo depois do console.error: na Vercel (Linux, saída
// por pipe) a escrita é assíncrona e o exit cortava a mensagem, deixando o log do build vazio.
// Aqui só marcamos process.exitCode e deixamos o processo terminar sozinho.

import path from "node:path";

import {
  criarCliente,
  emProducao,
  ERRO_SEM_BANCO_EM_PRODUCAO,
  urlParaMigracoes,
} from "../src/db/conexao";
import * as schema from "../src/db/schema";
import {
  erroMercadoPagoEmProducao,
  pagamentoFaltandoEmProducao,
} from "../src/lib/ambiente-producao";

const VARIAVEIS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_DIRETA",
  "POSTGRES_URL_NON_POOLING",
] as const;

/** Só protocolo, host e porta: nunca usuário, senha nem parâmetros da URL. */
function descreverUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "(padrão)"}`;
  } catch {
    return "(URL inválida)";
  }
}

/** Uma linha, sem segredos, para saber pelo log do build o que chegou ao processo. */
function diagnostico(url: string | null) {
  const presentes = VARIAVEIS.map(
    (nome) => `${nome}=${process.env[nome] ? "presente" : "ausente"}`,
  ).join(" ");
  const destino = url ? descreverUrl(url) : "nenhuma";
  console.log(
    `[db:migrar] ${presentes} VERCEL_ENV=${process.env.VERCEL_ENV ?? "(não definida)"} ` +
      `banco=${destino}`,
  );
}

/**
 * Mensagem e código do erro (ex.: ECONNREFUSED, 28P01), sem a URL nem a pilha inteira. Segue a
 * cadeia de `cause`: o Drizzle embrulha o erro do driver ("Failed query: …").
 */
function descreverErro(erro: unknown) {
  const partes: string[] = [];
  let atual: unknown = erro;
  for (let i = 0; atual && i < 5; i++) {
    if (atual instanceof Error) {
      const codigo = (atual as { code?: unknown }).code;
      const mensagem = atual.message.replace(/\s*params:\s*$/, "").trim();
      partes.push(`${atual.name}: ${mensagem}${codigo ? ` (código ${String(codigo)})` : ""}`);
      atual = atual.cause;
    } else {
      partes.push(String(atual));
      break;
    }
  }
  return partes.join(" <- causa: ");
}

/** Tira a URL e a senha de qualquer texto antes de imprimir, por garantia. */
function semUrl(texto: string, url: string | null) {
  if (!url) return texto;
  let limpo = texto.split(url).join("[URL do banco]");
  try {
    const { password } = new URL(url);
    for (const senha of new Set([password, decodeURIComponent(password)])) {
      if (senha) limpo = limpo.split(senha).join("***");
    }
  } catch {
    // URL inválida: já foi trocada inteira acima.
  }
  return limpo;
}

async function main() {
  // Produção sem as credenciais do gateway (Asaas ou Mercado Pago) não sobe
  // (src/lib/ambiente-producao.ts).
  const faltandoMp = pagamentoFaltandoEmProducao();
  if (faltandoMp.length > 0) {
    console.error(`[db:migrar] ${erroMercadoPagoEmProducao(faltandoMp)}`);
    process.exitCode = 1;
    return;
  }
  const url = urlParaMigracoes();
  diagnostico(url);
  if (!url) {
    if (emProducao()) {
      console.error(`[db:migrar] ${ERRO_SEM_BANCO_EM_PRODUCAO}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      "Sem DATABASE_URL nem POSTGRES_URL: nada a migrar (o app usa o PGlite em memória).",
    );
    return;
  }

  // Importados aqui, depois do diagnóstico, para que um erro ao carregá-los também saia no log.
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { semear, sincronizarGestores } = await import("../src/db/semente");

  const cliente = criarCliente(url, { maximo: 1 });
  try {
    const banco = drizzle({ client: cliente, schema, casing: "snake_case" });
    await migrate(banco, { migrationsFolder: path.join(process.cwd(), "src", "db", "migracoes") });
    console.log("Migrações aplicadas.");
    await semear(banco);
    await sincronizarGestores(banco);
    console.log("Semente e gestores conferidos.");
  } catch (erro) {
    console.error(
      `[db:migrar] Falha no banco ${descreverUrl(url)}: ${semUrl(descreverErro(erro), url)}`,
    );
    process.exitCode = 1;
  } finally {
    // Sem conexões abertas, o processo termina sozinho, depois de escrever toda a saída.
    await cliente.end().catch(() => {});
  }
}

main().catch((erro) => {
  console.error(`[db:migrar] ${semUrl(descreverErro(erro), urlParaMigracoes())}`);
  process.exitCode = 1;
});
