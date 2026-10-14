import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { bloqueiaNaManutencao, caminhoLiberadoNaManutencao } from "./manutencao";

describe("caminhoLiberadoNaManutencao", () => {
  it.each([
    "/entrar",
    "/entrar/",
    "/entrar/codigo",
    "/entrar/esqueci-senha",
    "/entrar/nova-senha",
    "/admin",
    "/admin/usuarios",
    "/api/auth/google",
    "/api/auth/google/callback",
    "/api/webhooks/mercadopago",
    "/api/jobs/pedidos",
    "/api/jobs/revisao",
    "/_next/static/chunks/app.js",
    "/icon.png",
    "/apple-icon.png",
    "/logo.png",
    "/avatares/avatar-01.svg",
    "/robots.txt",
  ])("deixa aberto %s", (caminho) => {
    expect(caminhoLiberadoNaManutencao(caminho)).toBe(true);
  });

  it.each([
    "/",
    "/eventos",
    "/eventos/corrida-ibirapuera-10k-2026",
    "/carrinho",
    "/checkout",
    "/cadastro",
    "/pedidos/123",
    "/minhas-compras",
    "/painel",
    "/painel/vendas",
    "/loja/liaramos",
    "/entrar-agora",
    "/entrar/outra-coisa",
    "/administracao",
    "/api/envios/processar",
    "/api/busca-facial",
    "/api/download/abc",
    "/api/metricas",
    "/api/painel/original/abc",
    "/api/webhooksfalsos",
    "/api/download/foto.jpg",
  ])("fecha %s", (caminho) => {
    expect(caminhoLiberadoNaManutencao(caminho)).toBe(false);
  });
});

describe("bloqueiaNaManutencao", () => {
  it("com a manutenção ligada, só o gestor passa", () => {
    expect(bloqueiaNaManutencao(true, null)).toBe(true);
    expect(bloqueiaNaManutencao(true, { papel: "cliente" })).toBe(true);
    expect(bloqueiaNaManutencao(true, { papel: "fotografo" })).toBe(true);
    expect(bloqueiaNaManutencao(true, { papel: "admin" })).toBe(false);
  });

  it("com a manutenção desligada, ninguém é barrado", () => {
    for (const usuario of [null, { papel: "cliente" as const }, { papel: "admin" as const }]) {
      expect(bloqueiaNaManutencao(false, usuario)).toBe(false);
    }
  });
});

// As páginas seguem a lista pela estrutura das pastas (o layout não sabe o caminho de forma
// confiável): abertas em grupos sem o portão, fechadas debaixo de um layout com ele. As rotas de
// API fechadas chamam a recusa; as abertas (webhooks, jobs, login) nunca.
const APP = path.resolve(__dirname, "../app");

function arquivos(pasta: string, nome: string): string[] {
  return readdirSync(pasta).flatMap((item) => {
    const caminho = path.join(pasta, item);
    if (statSync(caminho).isDirectory()) return arquivos(caminho, nome);
    return item === nome ? [caminho] : [];
  });
}

/** Endereço público do arquivo: sem os grupos e com um valor qualquer nos parâmetros. */
function endereco(arquivo: string) {
  const partes = path
    .relative(APP, path.dirname(arquivo))
    .split(path.sep)
    .filter((p) => p && !/^\(.+\)$/.test(p))
    .map((p) => (/^\[.+\]$/.test(p) ? "x" : p));
  return `/${partes.join("/")}`;
}

/** Algum layout entre src/app e a página tem o portão da manutenção? */
function temPortao(arquivo: string) {
  let pasta = path.dirname(arquivo);
  while (pasta.startsWith(APP)) {
    try {
      if (readFileSync(path.join(pasta, "layout.tsx"), "utf8").includes("<PortaoManutencao")) {
        return true;
      }
    } catch {
      // pasta sem layout
    }
    if (pasta === APP) break;
    pasta = path.dirname(pasta);
  }
  return false;
}

describe("estrutura do app segue a lista de exceções", () => {
  const paginas = arquivos(APP, "page.tsx");
  const rotas = arquivos(APP, "route.ts");

  it("encontra as páginas e rotas", () => {
    expect(paginas.length).toBeGreaterThan(40);
    expect(rotas.length).toBeGreaterThan(10);
  });

  it("toda página fechada tem o portão; as abertas (login e gestão) não", () => {
    const erradas = paginas
      .map((p) => ({ url: endereco(p), aberta: caminhoLiberadoNaManutencao(endereco(p)), p }))
      .filter(({ aberta, p }) => aberta === temPortao(p))
      .map(({ url, aberta }) => `${url} (${aberta ? "aberta com portão" : "fechada sem portão"})`);
    expect(erradas).toEqual([]);
  });

  it("o comChave do plugin do Lightroom recusa na manutenção", () => {
    const comum = readFileSync(path.join(APP, "api/plugin/comum.ts"), "utf8");
    expect(comum).toMatch(/respostaDaManutencaoPara\(dono\)/);
  });

  it("toda rota fechada recusa na manutenção; webhooks, jobs e login não", () => {
    const erradas = rotas
      .map((r) => {
        const url = endereco(r);
        const codigo = readFileSync(r, "utf8");
        // As rotas do plugin do Lightroom recusam dentro do comChave (api/plugin/comum.ts).
        const recusa = /respostaDaManutencao\(|recusarSeEmManutencao\(|comChave\(/.test(codigo);
        return { url, aberta: caminhoLiberadoNaManutencao(url), recusa };
      })
      .filter(({ aberta, recusa }) => aberta === recusa)
      .map(({ url, aberta }) => `${url} (${aberta ? "aberta que recusa" : "fechada sem recusa"})`);
    expect(erradas).toEqual([]);
  });
});
