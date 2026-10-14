import { describe, expect, it } from "vitest";

import { ErroGateway } from "./gateway-tipos";

describe("ErroGateway", () => {
  it("põe os códigos de erro na mensagem, sem as mensagens nem o resto da resposta", () => {
    const erro = new ErroGateway(
      403,
      {
        errors: [
          { code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", message: "pagador fulano@x.com" },
          { code: "texto com espaço não entra" },
        ],
        payer: { identification: { number: "12345678909" } },
      },
      "Mercado Pago",
    );
    expect(erro.message).toBe("Mercado Pago respondeu 403 (pa_unauthorized_result_from_policies)");
    expect(String(erro)).not.toContain("fulano");
    expect(JSON.stringify(erro)).not.toContain("12345678909");
  });

  it("sem código na resposta, só o status", () => {
    expect(new ErroGateway(500, null, "Mercado Pago").message).toBe("Mercado Pago respondeu 500");
  });
});
