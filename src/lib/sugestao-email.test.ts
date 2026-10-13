import { describe, expect, it } from "vitest";

import { sugerirEmail } from "./sugestao-email";

describe("sugestão de e-mail no checkout", () => {
  it("corrige os erros de digitação mais comuns", () => {
    expect(sugerirEmail("vyrna@gmial.com")).toBe("vyrna@gmail.com");
    expect(sugerirEmail("vyrna@gmail.con")).toBe("vyrna@gmail.com");
    expect(sugerirEmail("Vyrna@Hotmal.com")).toBe("vyrna@hotmail.com");
    expect(sugerirEmail("ana@outlok.com")).toBe("ana@outlook.com");
    expect(sugerirEmail("ana@yaho.com.br")).toBe("ana@yahoo.com.br");
    expect(sugerirEmail("ana@gmail.com.br")).toBe("ana@gmail.com");
  });

  it("não mexe em domínio certo nem em domínio próprio", () => {
    expect(sugerirEmail("ana@gmail.com")).toBeNull();
    expect(sugerirEmail("ana@hotmail.com.br")).toBeNull();
    expect(sugerirEmail("contato@clicouai.com")).toBeNull();
    expect(sugerirEmail("ana@empresa.com.br")).toBeNull();
    expect(sugerirEmail("sem-arroba")).toBeNull();
  });
});
