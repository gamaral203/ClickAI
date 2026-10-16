import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// Ajustes da marca e prévia desfocada por evento, em Painel > Marca d'água.

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarContaDoFotografo,
  definirPreviaDesfocada,
  eventosDaPreviaDesfocada,
  marcaDoDonoDoEvento,
  salvarAjustesDaMarca,
} from "@/dados";
import { ajustesDaMarcaDaConta } from "@/dados/painel";
import { eventos, fotografos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

const [lia, pedro] = fotografos;
const evento = eventos.find((e) => e.fotografoId === lia.id)!;

describe("ajustes da marca do fotógrafo", () => {
  it("salvos na conta, valem nas fotos dos eventos dele; null volta ao padrão", async () => {
    await salvarAjustesDaMarca(lia.id, {
      tamanhoPct: 150,
      quantidade: 30,
      opacidadePct: 60,
      larguraPrevia: 1200,
      variacao: false,
    });
    expect((await marcaDoDonoDoEvento(evento.id)).ajustes).toEqual({
      tamanhoPct: 150,
      quantidade: 30,
      opacidadePct: 60,
      larguraPrevia: 1200,
      variacao: false,
    });
    const conta = (await buscarContaDoFotografo(lia.usuarioId))!;
    expect(ajustesDaMarcaDaConta(conta)).toEqual({
      tamanhoPct: 150,
      quantidade: 30,
      opacidadePct: 60,
      larguraPrevia: 1200,
      variacao: false,
    });

    await salvarAjustesDaMarca(lia.id, null);
    expect((await marcaDoDonoDoEvento(evento.id)).ajustes).toBeNull();
  });
});

describe("prévia desfocada por evento", () => {
  it("o dono liga e desliga; outro fotógrafo não mexe", async () => {
    expect(await definirPreviaDesfocada(evento.id, pedro.id, true)).toBe(false);
    expect(await definirPreviaDesfocada(evento.id, lia.id, true)).toBe(true);
    const banco = await obterBanco();
    const [linha] = await banco
      .select({ previaDesfocada: t.eventos.previaDesfocada })
      .from(t.eventos)
      .where(eq(t.eventos.id, evento.id));
    expect(linha.previaDesfocada).toBe(true);
    const lista = await eventosDaPreviaDesfocada(lia.id);
    expect(lista.find((e) => e.id === evento.id)?.previaDesfocada).toBe(true);
    // Só os eventos dela.
    expect(lista.every((e) => eventos.find((x) => x.id === e.id)?.fotografoId === lia.id)).toBe(
      true,
    );
    expect(await definirPreviaDesfocada(evento.id, lia.id, false)).toBe(true);
  });

  it("evento inexistente: nada muda", async () => {
    expect(await definirPreviaDesfocada(randomUUID(), lia.id, true)).toBe(false);
  });
});
