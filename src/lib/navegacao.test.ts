import { describe, expect, it } from "vitest";

import type { Papel } from "@/dados/tipos";

import {
  destinoDaVitrine,
  destinoDoLogo,
  inicioDoPapel,
  linkAtivo,
  linksDoCabecalho,
  mostraCartaoMeta,
  podeComprar,
} from "./navegacao";

const usuario = (papel: Papel) => ({ papel, nome: "Ana Souza" });
const hrefs = (itens: { href: string }[]) => itens.map((i) => i.href);

describe("linksDoCabecalho", () => {
  it("visitante: site de compra, com carrinho, entrar e rodapé completo", () => {
    const nav = linksDoCabecalho(null);
    expect(nav.variante).toBe("publico");
    expect(nav.carrinho).toBe(true);
    expect(nav.perfil).toBeNull();
    expect(nav.rodape).toBe("completo");
    expect(hrefs(nav.desktop)).toEqual(["/", "/eventos"]);
    expect(hrefs(nav.celular)).toEqual([
      "/",
      "/eventos",
      "/entrar",
      "/cadastro",
      "/cadastro?tipo=fotografo",
      "/ajuda",
    ]);
  });

  it("cliente: site de compra com Minhas compras, sem atalhos do painel", () => {
    const nav = linksDoCabecalho(usuario("cliente"));
    expect(nav.variante).toBe("publico");
    expect(nav.carrinho).toBe(true);
    expect(nav.perfil?.href).toBe("/minhas-compras");
    expect(nav.rodape).toBe("completo");
    expect(hrefs(nav.celular)).toEqual([
      "/",
      "/eventos",
      "/minhas-compras",
      "/conta/seguranca",
      "/ajuda",
    ]);
    expect(hrefs(nav.celular).some((h) => h.startsWith("/painel") || h === "/admin")).toBe(false);
  });

  it("fotógrafo: cabeçalho do painel com Início, sem carrinho, vitrine nem compras", () => {
    const nav = linksDoCabecalho(usuario("fotografo"));
    expect(nav.variante).toBe("painel");
    expect(nav.carrinho).toBe(false);
    expect(nav.rodape).toBe("curto");
    expect(nav.perfil?.href).toBe("/painel/perfil");
    expect(nav.desktop[0]).toEqual({ href: "/painel", rotulo: "Início", exato: true });
    expect(hrefs(nav.desktop)).toEqual([
      "/painel",
      "/painel/eventos",
      "/painel/vendas",
      "/painel/desempenho",
      "/painel/loja",
    ]);
    expect(hrefs(nav.celular)).toEqual([
      "/painel",
      "/painel/eventos",
      "/painel/vendas",
      "/painel/desempenho",
      "/painel/loja",
      "/painel/metas",
      "/painel/perfil",
      "/conta/seguranca",
      "/ajuda",
    ]);
    for (const proibido of ["/", "/eventos", "/minhas-compras", "/carrinho", "/admin"]) {
      expect(hrefs([...nav.desktop, ...nav.celular])).not.toContain(proibido);
    }
  });

  it("gestor: cabeçalho do painel com o atalho da Gestão", () => {
    const nav = linksDoCabecalho(usuario("admin"));
    expect(nav.variante).toBe("painel");
    expect(nav.carrinho).toBe(false);
    expect(nav.rodape).toBe("curto");
    expect(hrefs(nav.desktop)).toEqual([
      "/painel",
      "/painel/eventos",
      "/painel/vendas",
      "/painel/desempenho",
      "/painel/loja",
      "/admin",
    ]);
    expect(hrefs(nav.celular)).toContain("/admin");
    expect(hrefs(nav.celular).slice(0, 1)).toEqual(["/painel"]);
    expect(hrefs(nav.celular)).toContain("/painel/metas");
    expect(hrefs(nav.celular)).not.toContain("/minhas-compras");
  });
});

describe("destinoDoLogo", () => {
  it("leva cada um ao seu início", () => {
    expect(destinoDoLogo(null, "/eventos")).toBe("/");
    expect(destinoDoLogo("cliente", "/minhas-compras")).toBe("/");
    expect(destinoDoLogo("fotografo", "/painel/vendas")).toBe("/painel");
    expect(destinoDoLogo("fotografo", "/admin")).toBe("/painel");
    expect(destinoDoLogo("admin", "/painel/eventos")).toBe("/painel");
    expect(destinoDoLogo("admin", "/eventos/corrida")).toBe("/painel");
  });

  it("o gestor, dentro da gestão, volta à visão geral da gestão", () => {
    expect(destinoDoLogo("admin", "/admin")).toBe("/admin");
    expect(destinoDoLogo("admin", "/admin/usuarios")).toBe("/admin");
    expect(destinoDoLogo("admin", "/administracao")).toBe("/painel");
    expect(destinoDoLogo("admin", null)).toBe("/painel");
  });
});

describe("linkAtivo", () => {
  it("marca a página e as seções dela, sem pegar prefixos de outra palavra", () => {
    expect(linkAtivo("/painel/eventos", "/painel/eventos")).toBe(true);
    expect(linkAtivo("/painel/eventos/123", "/painel/eventos")).toBe(true);
    expect(linkAtivo("/painel/eventos-antigos", "/painel/eventos")).toBe(false);
    expect(linkAtivo("/eventos", "/")).toBe(false);
    expect(linkAtivo("/", "/")).toBe(true);
    expect(linkAtivo(null, "/")).toBe(false);
  });

  it("com `exato`, marca o Início do painel só em /painel", () => {
    expect(linkAtivo("/painel", "/painel", true)).toBe(true);
    expect(linkAtivo("/painel/eventos", "/painel", true)).toBe(false);
    expect(linkAtivo("/painel/metas", "/painel", true)).toBe(false);
    // Sem `exato`, a Gestão segue marcada nas páginas da gestão.
    expect(linkAtivo("/admin/usuarios", "/admin")).toBe(true);
  });

  it("em cada página do painel, só um atalho fica marcado", () => {
    const { desktop } = linksDoCabecalho(usuario("fotografo"));
    const marcados = (caminho: string) =>
      desktop.filter((i) => linkAtivo(caminho, i.href, i.exato)).map((i) => i.rotulo);
    expect(marcados("/painel")).toEqual(["Início"]);
    expect(marcados("/painel/eventos/123")).toEqual(["Meus eventos"]);
    expect(marcados("/painel/vendas")).toEqual(["Financeiro"]);
    expect(marcados("/painel/perfil")).toEqual([]);
  });
});

describe("mostraCartaoMeta", () => {
  const conta = { id: "f1a7c0de-0000-4000-8000-000000000001" };

  it("quem tem conta de fotógrafo vê o cartão, inclusive o gestor que também vende", () => {
    expect(mostraCartaoMeta({ papel: "fotografo" }, conta)).toBe(true);
    expect(mostraCartaoMeta({ papel: "admin" }, conta)).toBe(true);
  });

  it("sem conta de fotógrafo, ninguém vê", () => {
    expect(mostraCartaoMeta({ papel: "fotografo" }, null)).toBe(false);
    expect(mostraCartaoMeta({ papel: "admin" }, null)).toBe(false);
  });

  it("visitante e cliente não usam o painel", () => {
    expect(mostraCartaoMeta(null, conta)).toBe(false);
    expect(mostraCartaoMeta({ papel: "cliente" }, conta)).toBe(false);
  });
});

describe("podeComprar", () => {
  it("convidado e cliente compram; fotógrafo e gestor, não", () => {
    expect(podeComprar(null)).toBe(true);
    expect(podeComprar({ papel: "cliente" })).toBe(true);
    expect(podeComprar({ papel: "fotografo" })).toBe(false);
    expect(podeComprar({ papel: "admin" })).toBe(false);
  });
});

describe("destinoDaVitrine", () => {
  it("visitante e cliente ficam na vitrine", () => {
    expect(destinoDaVitrine(null, "/")).toBeNull();
    expect(destinoDaVitrine(null, "/eventos")).toBeNull();
    expect(destinoDaVitrine({ papel: "cliente" }, "/")).toBeNull();
    expect(destinoDaVitrine({ papel: "cliente" }, "/eventos")).toBeNull();
  });

  it("fotógrafo vai para o painel; gestor, para a gestão no início", () => {
    expect(destinoDaVitrine({ papel: "fotografo" }, "/")).toBe("/painel");
    expect(destinoDaVitrine({ papel: "fotografo" }, "/eventos")).toBe("/painel/eventos");
    expect(destinoDaVitrine({ papel: "admin" }, "/")).toBe("/admin");
    expect(destinoDaVitrine({ papel: "admin" }, "/eventos")).toBe("/painel/eventos");
  });
});

describe("inicioDoPapel", () => {
  it("manda cada papel para a sua área", () => {
    expect(inicioDoPapel("cliente")).toBe("/minhas-compras");
    expect(inicioDoPapel("fotografo")).toBe("/painel");
    expect(inicioDoPapel("admin")).toBe("/admin");
  });
});
