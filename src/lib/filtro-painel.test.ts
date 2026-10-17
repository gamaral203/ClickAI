import { describe, expect, it } from "vitest";

import {
  diaEmBrasilia,
  FILTRO_PADRAO,
  filtroDaUrl,
  filtroDoPainelSchema,
  filtroParaUrl,
  intervaloDoDia,
  rotuloDoDia,
} from "./filtro-painel";

describe("filtro da grade do painel", () => {
  it("o dia é o de Brasília: 23:30 ainda é o mesmo dia, 00:10 já é o seguinte", () => {
    expect(diaEmBrasilia("2026-10-16T23:30:00-03:00")).toBe("2026-10-16");
    expect(diaEmBrasilia("2026-10-17T02:30:00.000Z")).toBe("2026-10-16");
    expect(diaEmBrasilia("2026-10-17T00:10:00-03:00")).toBe("2026-10-17");
    const intervalo = intervaloDoDia("2026-10-16")!;
    expect(intervalo.inicio.toISOString()).toBe("2026-10-16T03:00:00.000Z");
    expect(intervalo.fim.toISOString()).toBe("2026-10-17T03:00:00.000Z");
    expect(intervaloDoDia("2026-02-30")).toBeNull();
  });

  it("rótulo curto do dia", () => {
    expect(rotuloDoDia("2026-10-16", 2026)).toBe("16/10");
    expect(rotuloDoDia("2025-10-16", 2026)).toBe("16/10/2025");
  });

  it("lê e grava a URL, com valor inválido voltando ao padrão", () => {
    const id = "6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f";
    const url = new URLSearchParams(`secao=fotos&pasta=${id}&dia=2026-10-16&data=envio`);
    const filtro = filtroDaUrl(url, "captura");
    expect(filtro).toEqual({ liberacao: "todas", pasta: id, base: "envio", dia: "2026-10-16" });
    expect(filtroParaUrl(filtro, url, "captura").toString()).toBe(
      `secao=fotos&pasta=${id}&dia=2026-10-16&data=envio`,
    );
    expect(filtroParaUrl(FILTRO_PADRAO, url, "captura").toString()).toBe("secao=fotos");

    const ruim = new URLSearchParams("pasta=../x&dia=ontem&liberacao=tudo&data=hoje");
    expect(filtroDaUrl(ruim, "envio")).toEqual({ ...FILTRO_PADRAO, base: "envio" });
    // "Sem data" só existe no dia da captura.
    expect(filtroDaUrl(new URLSearchParams("dia=sem-data&data=envio"), "captura").dia).toBe(
      "todos",
    );
    expect(filtroDoPainelSchema.safeParse({ dia: "sem-data", base: "envio" }).success).toBe(false);
  });
});
