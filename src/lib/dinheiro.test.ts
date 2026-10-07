import { describe, expect, it } from "vitest";

import { centavosParaCampo, reaisParaCentavos } from "./dinheiro";

describe("reaisParaCentavos", () => {
  it.each([
    ["19,90", 1990],
    ["19.90", 1990],
    ["R$ 19,90", 1990],
    ["1.234,5", 123450],
    ["20", 2000],
    ["0,01", 1],
  ])("%s → %i", (texto, centavos) => {
    expect(reaisParaCentavos(texto)).toBe(centavos);
  });

  it.each(["", "abc", "19,999", "-5", "1,2,3"])("recusa %j", (texto) => {
    expect(reaisParaCentavos(texto)).toBeNull();
  });
});

describe("centavosParaCampo", () => {
  it("formata com vírgula e dois decimais", () => {
    expect(centavosParaCampo(1990)).toBe("19,90");
    expect(centavosParaCampo(5)).toBe("0,05");
  });
});
