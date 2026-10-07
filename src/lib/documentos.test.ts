import { describe, expect, it } from "vitest";

import { cnpjValido, cpfOuCnpjValido, cpfValido, formatarCpfCnpj } from "./documentos";

describe("CPF e CNPJ", () => {
  it("aceita documentos com dígitos verificadores certos, com ou sem pontuação", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cpfOuCnpjValido("11222333000181")).toBe(true);
  });

  it("recusa dígito errado, tamanho errado e números repetidos", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(cpfOuCnpjValido("123")).toBe(false);
  });

  it("formata", () => {
    expect(formatarCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(formatarCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
