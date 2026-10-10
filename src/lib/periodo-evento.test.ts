import { describe, expect, it } from "vitest";
import { z } from "zod";

import { campoDoDia, dataPorExtenso, diaDoCampo, juntarCampo, separarCampo } from "./campo-data";
import { formatarPeriodo } from "./formatar";
import {
  camposDoPeriodo,
  eventoNoDia,
  fimOuInicio,
  MENSAGEM_FIM_ANTES_DO_INICIO,
  periodoValido,
} from "./periodo-evento";

// Mesmo formato do formulário do evento (src/app/(fotografo)/painel/eventos/acoes.ts).
const periodo = z
  .object(camposDoPeriodo)
  .refine(periodoValido, { path: ["fimEm"], message: MENSAGEM_FIM_ANTES_DO_INICIO });

describe("validação do período do evento", () => {
  it("aceita evento sem data final (vazia ou ausente) e grava null", () => {
    for (const fimEm of ["", "   ", undefined]) {
      const r = periodo.safeParse({ inicioEm: "2026-10-07T08:00", fimEm });
      expect(r.success).toBe(true);
      expect(r.data).toEqual({ inicioEm: "2026-10-07T08:00:00-03:00", fimEm: null });
    }
  });

  it("aceita data final igual ou depois do início", () => {
    expect(
      periodo.safeParse({ inicioEm: "2026-10-07T08:00", fimEm: "2026-10-07T08:00" }).data,
    ).toEqual({ inicioEm: "2026-10-07T08:00:00-03:00", fimEm: "2026-10-07T08:00:00-03:00" });
    expect(
      periodo.safeParse({ inicioEm: "2026-10-07T08:00", fimEm: "2026-10-09T18:00" }).success,
    ).toBe(true);
  });

  it("recusa data final antes do início, com mensagem clara no campo", () => {
    const r = periodo.safeParse({ inicioEm: "2026-10-07T08:00", fimEm: "2026-10-06T23:00" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]).toMatchObject({
      path: ["fimEm"],
      message: "A data final não pode ser antes do início.",
    });
    // Mesmo dia, hora antes do início.
    expect(
      periodo.safeParse({ inicioEm: "2026-10-07T08:00", fimEm: "2026-10-07T07:59" }).success,
    ).toBe(false);
  });

  it("início continua obrigatório; data final malformada é recusada", () => {
    expect(periodo.safeParse({ inicioEm: "", fimEm: "" }).success).toBe(false);
    const r = periodo.safeParse({ inicioEm: "2026-10-07T08:00", fimEm: "2026-10-07" });
    expect(r.error!.issues[0].path).toEqual(["fimEm"]);
  });
});

describe("formatarPeriodo", () => {
  it("sem data final, mostra só o início", () => {
    expect(formatarPeriodo("2026-10-07T08:00:00-03:00", null)).toBe("7 de outubro de 2026");
  });

  it("terminando no mesmo dia, mostra só o dia", () => {
    expect(formatarPeriodo("2026-10-07T08:00:00-03:00", "2026-10-07T23:00:00-03:00")).toBe(
      "7 de outubro de 2026",
    );
  });

  it("intervalo no mesmo mês, entre meses e entre anos", () => {
    expect(formatarPeriodo("2026-10-07T08:00:00-03:00", "2026-10-09T18:00:00-03:00")).toBe(
      "7 a 9 de outubro de 2026",
    );
    expect(formatarPeriodo("2026-09-30T08:00:00-03:00", "2026-10-02T18:00:00-03:00")).toBe(
      "30 de setembro a 2 de outubro de 2026",
    );
    expect(formatarPeriodo("2026-12-31T20:00:00-03:00", "2027-01-01T04:00:00-03:00")).toBe(
      "31 de dezembro de 2026 a 1 de janeiro de 2027",
    );
  });

  it("usa o dia de Brasília, não o de UTC", () => {
    // 22h de Brasília já é o dia seguinte em UTC.
    expect(formatarPeriodo("2026-10-07T22:00:00-03:00", null)).toBe("7 de outubro de 2026");
    expect(formatarPeriodo("2026-10-07T22:00:00-03:00", "2026-10-08T01:00:00Z")).toBe(
      "7 de outubro de 2026",
    );
  });
});

describe("dia do evento (COALESCE do fim com o início)", () => {
  const umDia = { inicioEm: "2026-10-07T08:00:00-03:00", fimEm: null };
  const tresDias = { inicioEm: "2026-10-07T08:00:00-03:00", fimEm: "2026-10-09T18:00:00-03:00" };

  it("sem data final, o fim é o início", () => {
    expect(fimOuInicio(umDia)).toBe(umDia.inicioEm);
    expect(fimOuInicio(tresDias)).toBe(tresDias.fimEm);
  });

  it("filtra pelo dia: só o de início sem data final; qualquer um do intervalo com ela", () => {
    expect(eventoNoDia(umDia, "2026-10-07")).toBe(true);
    expect(eventoNoDia(umDia, "2026-10-08")).toBe(false);
    expect(
      ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map((d) =>
        eventoNoDia(tresDias, d),
      ),
    ).toEqual([false, true, true, true, false]);
  });
});

describe("campo de data do seletor", () => {
  it("separa e junta o valor do formulário", () => {
    expect(separarCampo("2026-10-07T08:30")).toEqual({ dia: "2026-10-07", hora: "08:30" });
    expect(separarCampo("")).toEqual({ dia: "", hora: "" });
    expect(separarCampo("lixo")).toEqual({ dia: "", hora: "" });
    expect(juntarCampo("2026-10-07", "08:30")).toBe("2026-10-07T08:30");
    expect(juntarCampo("2026-10-07", "")).toBe("");
  });

  it("ida e volta do calendário não desloca o dia (sem new Date('AAAA-MM-DD'))", () => {
    for (const dia of ["2026-10-07", "2026-01-01", "2026-12-31", "2028-02-29"]) {
      expect(campoDoDia(diaDoCampo(dia))).toBe(dia);
    }
  });

  it("escreve o dia por extenso em português", () => {
    expect(dataPorExtenso("2026-10-07")).toMatch(/^qua\.?, 7 de outubro de 2026$/);
  });
});
