import { describe, expect, it } from "vitest";

import { caminhoSeguro } from "./redirecionamento";

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
