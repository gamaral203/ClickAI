import { describe, expect, it } from "vitest";

import { caminhoSeguro, destinoDeQuemJaEntrou, destinoDoCadastro } from "./redirecionamento";

describe("caminhoSeguro (contra redirecionamento aberto)", () => {
  it("aceita caminhos internos, com busca e âncora", () => {
    expect(caminhoSeguro("/painel")).toBe("/painel");
    expect(caminhoSeguro("/fotografo/lia-ramos?aba=eventos#topo")).toBe(
      "/fotografo/lia-ramos?aba=eventos#topo",
    );
  });

  it.each([
    "https://golpe.com",
    "//golpe.com",
    "/\\golpe.com",
    "/\t/golpe.com",
    "/\n/golpe.com",
    "/\u0000/golpe.com",
    "javascript:alert(1)",
    "painel",
    "/" + "a".repeat(400),
  ])("recusa %j", (valor) => {
    expect(caminhoSeguro(valor, "/padrao")).toBe("/padrao");
  });

  it("recusa o que não é texto", () => {
    expect(caminhoSeguro(null, "/padrao")).toBe("/padrao");
    expect(caminhoSeguro(["/painel"], "/padrao")).toBe("/padrao");
  });
});

describe("destinoDoCadastro", () => {
  it("conta nova vai para a tela principal do papel, ou para o ?proximo= seguro", () => {
    expect(destinoDoCadastro(null, "cliente")).toBe("/");
    expect(destinoDoCadastro(null, "fotografo")).toBe("/painel");
    expect(destinoDoCadastro(null, "admin")).toBe("/admin");
    expect(destinoDoCadastro("/fotografo/lia-ramos", "cliente")).toBe("/fotografo/lia-ramos");
    expect(destinoDoCadastro("https://golpe.com", "fotografo")).toBe("/painel");
  });
});

describe("destinoDeQuemJaEntrou (/entrar e /cadastro com sessão aberta)", () => {
  it("em /entrar, cada papel vai para a sua área", () => {
    expect(destinoDeQuemJaEntrou("fotografo", undefined, "entrar")).toBe("/painel");
    expect(destinoDeQuemJaEntrou("cliente", undefined, "entrar")).toBe("/minhas-compras");
    expect(destinoDeQuemJaEntrou("admin", undefined, "entrar")).toBe("/admin");
  });

  it("em /cadastro, quem vende vai para a sua área e o cliente fica (pode ativar a venda)", () => {
    expect(destinoDeQuemJaEntrou("fotografo", undefined, "cadastro")).toBe("/painel");
    expect(destinoDeQuemJaEntrou("admin", undefined, "cadastro")).toBe("/admin");
    expect(destinoDeQuemJaEntrou("cliente", "/painel", "cadastro")).toBeNull();
  });

  it("respeita o ?proximo= seguro e recusa o de fora", () => {
    expect(destinoDeQuemJaEntrou("fotografo", "/painel/vendas", "entrar")).toBe("/painel/vendas");
    expect(destinoDeQuemJaEntrou("cliente", "/fotografo/lia", "entrar")).toBe("/fotografo/lia");
    expect(destinoDeQuemJaEntrou("fotografo", "//golpe.com", "entrar")).toBe("/painel");
  });

  it("não volta para /entrar nem /cadastro (sem laço)", () => {
    expect(destinoDeQuemJaEntrou("fotografo", "/entrar", "entrar")).toBe("/painel");
    expect(destinoDeQuemJaEntrou("cliente", "/cadastro?tipo=fotografo", "entrar")).toBe(
      "/minhas-compras",
    );
    expect(destinoDeQuemJaEntrou("admin", "/entrar/codigo", "cadastro")).toBe("/admin");
    expect(destinoDeQuemJaEntrou("fotografo", "/entrarx", "entrar")).toBe("/entrarx");
  });
});
