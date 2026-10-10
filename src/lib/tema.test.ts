import { describe, expect, it } from "vitest";

import { caminhoTemTemaNoturno, temaDoCookie } from "./tema";

describe("tema", () => {
  it("o padrão é o dia; só 'escuro' liga o noturno", () => {
    expect(temaDoCookie(undefined)).toBe("claro");
    expect(temaDoCookie("qualquer")).toBe("claro");
    expect(temaDoCookie("escuro")).toBe("escuro");
  });

  it("só o painel e a gestão têm modo noturno", () => {
    expect(caminhoTemTemaNoturno("/painel")).toBe(true);
    expect(caminhoTemTemaNoturno("/painel/vendas")).toBe(true);
    expect(caminhoTemTemaNoturno("/admin/saques")).toBe(true);
    expect(caminhoTemTemaNoturno("/")).toBe(false);
    expect(caminhoTemTemaNoturno("/eventos")).toBe(false);
    expect(caminhoTemTemaNoturno("/paineleiro")).toBe(false);
    expect(caminhoTemTemaNoturno(null)).toBe(false);
  });
});
