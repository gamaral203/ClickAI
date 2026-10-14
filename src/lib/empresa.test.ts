import { describe, expect, it } from "vitest";

import { cnpjValido } from "./documentos";
import { EMPRESA } from "./empresa";

describe("EMPRESA", () => {
  it("tem um CNPJ com os dígitos verificadores válidos", () => {
    expect(cnpjValido(EMPRESA.cnpj)).toBe(true);
  });

  it("usa a grafia oficial da marca", () => {
    expect(EMPRESA.marca).toBe("ClicouAí");
  });
});
