import { describe, expect, it } from "vitest";

import { mascararEmail } from "./mascarar-email";

describe("mascararEmail", () => {
  it("mostra as duas primeiras letras e o domínio", () => {
    expect(mascararEmail("erick@gmail.com")).toBe("er***@gmail.com");
    expect(mascararEmail("  Gestora.Teste@Exemplo.com.br ")).toBe("ge***@exemplo.com.br");
  });

  it("nome curto mostra só a primeira letra", () => {
    expect(mascararEmail("ana@gmail.com")).toBe("a***@gmail.com");
    expect(mascararEmail("a@b.com")).toBe("a***@b.com");
  });

  it("texto sem formato de e-mail não aparece", () => {
    expect(mascararEmail("")).toBe("***");
    expect(mascararEmail("semarroba")).toBe("***");
    expect(mascararEmail("@dominio.com")).toBe("***");
    expect(mascararEmail("nome@")).toBe("***");
  });
});
