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
    expect(erro.message).toBe("Mercado Pago respondeu 403 (PA_UNAUTHORIZED_RESULT_FROM_POLICIES)");
    expect(String(erro)).not.toContain("fulano");
    expect(JSON.stringify(erro)).not.toContain("12345678909");
  });

  it("402 do Mercado Pago: o motivo de cada pagamento da order", () => {
    const erro = new ErroGateway(
      402,
      {
        errors: [{ code: "failed", message: "The following transactions failed" }],
        data: {
          id: "ORD01",
          transactions: {
            payments: [{ status: "failed", status_detail: "collector_without_pix_key" }],
          },
          payer: { email: "fulano@x.com" },
        },
      },
      "Mercado Pago",
    );
    expect(erro.message).toBe("Mercado Pago respondeu 402 (failed, collector_without_pix_key)");
    expect(erro.message).not.toContain("fulano");
  });

  it("sem código na resposta, só o status", () => {
    expect(new ErroGateway(500, null, "Mercado Pago").message).toBe("Mercado Pago respondeu 500");
  });
});
