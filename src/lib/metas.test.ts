import { describe, expect, it } from "vitest";

import { situacaoDasMetas } from "./metas";

describe("metas de vendas", () => {
  it("começa como Iniciante, mirando os R$ 10 mil", () => {
    const s = situacaoDasMetas(18_298);
    expect(s.nivel).toBe("Iniciante");
    expect(s.proxima?.rotulo).toBe("10K");
    expect(s.progressoPct).toBe(1);
    expect(s.faltaCentavos).toBe(10_000_00 - 18_298);
    expect(s.conquistadas).toEqual([]);
  });

  it("bater exatamente a meta já conta", () => {
    const s = situacaoDasMetas(10_000_00);
    expect(s.nivel).toBe("10K");
    expect(s.proxima?.rotulo).toBe("25K");
    expect(s.progressoPct).toBe(40);
  });

  it("depois de R$ 1 milhão, todas batidas", () => {
    const s = situacaoDasMetas(1_200_000_00);
    expect(s.conquistadas.map((m) => m.rotulo)).toEqual([
      "10K",
      "25K",
      "50K",
      "100K",
      "500K",
      "1M",
    ]);
    expect(s.proxima).toBeNull();
    expect(s.progressoPct).toBe(100);
    expect(s.faltaCentavos).toBe(0);
  });
});
