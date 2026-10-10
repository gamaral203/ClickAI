import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  buscarEventoPublicado,
  capasDosEventos,
  definirCapaDoEvento,
  excluirItem,
  imagemDeCapaDoEvento,
  listarEventosPublicados,
} from "@/dados";
// Os ids vêm dos dados de exemplo: são os mesmos que a semente grava no banco (PGlite).
import { eventos, fotografos, fotos } from "@/dados/exemplo/dados";
import { obterBanco } from "@/db";
import * as t from "@/db/schema";

const [lia, pedro, clique] = fotografos;
// Evento da Lia, liberação automática; o Pedro colabora (aceito nos dados de exemplo).
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const outroEvento = eventos.find((e) => e.id !== ibirapuera.id && e.fotografoId === lia.id)!;
const prontas = fotos.filter(
  (f) => f.eventoId === ibirapuera.id && f.status === "pronta" && f.excluidaEm === null,
);
const fotoDeOutroEvento = fotos.find(
  (f) => f.eventoId !== ibirapuera.id && f.status === "pronta" && f.excluidaEm === null,
)!;

async function capaAgora(eventoId = ibirapuera.id) {
  return (await capasDosEventos([eventoId], Date.now())).get(eventoId) ?? null;
}

async function mudarFoto(fotoId: string, valores: Partial<typeof t.fotos.$inferInsert>) {
  const banco = await obterBanco();
  await banco.update(t.fotos).set(valores).where(eq(t.fotos.id, fotoId));
}

describe("capa do evento", () => {
  it("sem escolha, usa uma foto liberada do evento, sempre a mesma", async () => {
    const primeira = await capaAgora();
    const segunda = await capaAgora();
    expect(primeira).not.toBeNull();
    expect(primeira!.escolhida).toBe(false);
    expect(prontas.map((f) => f.id)).toContain(primeira!.fotoId);
    expect(segunda).toEqual(primeira);

    // O cartão público mostra a mesma, em duas listagens seguidas.
    const lista1 = await listarEventosPublicados();
    const lista2 = await listarEventosPublicados();
    const cartao1 = lista1.find((e) => e.id === ibirapuera.id)!;
    const cartao2 = lista2.find((e) => e.id === ibirapuera.id)!;
    expect(cartao1.situacaoGaleria.tipo).toBe("aberta");
    expect(cartao1.capaMiniatura).toEqual(cartao2.capaMiniatura);
    expect(cartao1.capaMiniatura?.urlMiniatura).toBe(primeira!.urlMiniatura);
    // Sempre a prévia com marca d'água ou a miniatura; o original não aparece.
    expect(cartao1.capaMiniatura?.urlPrevia).toBe(primeira!.urlPrevia);
  });

  it("a capa escolhida pelo dono aparece nos cartões e na página do evento", async () => {
    const automatica = await capaAgora();
    const escolhida = prontas.find((f) => f.id !== automatica!.fotoId)!;
    expect(await definirCapaDoEvento(ibirapuera.id, lia.id, escolhida.id)).toEqual({ ok: true });

    const capa = await capaAgora();
    expect(capa).toMatchObject({ fotoId: escolhida.id, escolhida: true });
    const evento = await buscarEventoPublicado(ibirapuera.slug);
    expect(evento?.capaFotoId).toBe(escolhida.id);
    expect(evento?.capaMiniatura?.urlMiniatura).toBe(escolhida.urlMiniatura);
    expect(evento?.capaMiniatura?.urlPrevia).toBe(escolhida.urlPrevia);
    // A divulgação usa a prévia da escolhida.
    expect(await imagemDeCapaDoEvento(ibirapuera.id)).toBe(escolhida.urlPrevia);

    // Remover volta para a automática de antes.
    expect(await definirCapaDoEvento(ibirapuera.id, lia.id, null)).toEqual({ ok: true });
    expect(await capaAgora()).toEqual(automatica);
  });

  it("escolhida ainda não liberada cai para a automática até ser liberada", async () => {
    const automatica = await capaAgora();
    const escolhida = prontas.find((f) => f.id !== automatica!.fotoId)!;
    expect(await definirCapaDoEvento(ibirapuera.id, lia.id, escolhida.id)).toEqual({ ok: true });

    await mudarFoto(escolhida.id, { liberarEm: new Date(Date.now() + 60 * 60 * 1000) });
    expect(await capaAgora()).toEqual(automatica);
    await mudarFoto(escolhida.id, { liberarEm: null });
    expect(await capaAgora()).toEqual(automatica);

    await mudarFoto(escolhida.id, { liberarEm: new Date(Date.now() - 1000) });
    expect(await capaAgora()).toMatchObject({ fotoId: escolhida.id, escolhida: true });
    await definirCapaDoEvento(ibirapuera.id, lia.id, null);
  });

  it("escolhida excluída cai para a automática", async () => {
    const automatica = await capaAgora();
    const [a, b] = prontas.filter((f) => f.id !== automatica!.fotoId);

    // Exclusão lógica direto no banco (a escolha continua gravada): a consulta já ignora.
    await definirCapaDoEvento(ibirapuera.id, lia.id, a.id);
    await mudarFoto(a.id, { excluidaEm: new Date() });
    expect(await capaAgora()).toEqual(automatica);

    // Pelo painel, excluir a capa também apaga a escolha.
    await definirCapaDoEvento(ibirapuera.id, lia.id, b.id);
    expect(await excluirItem(b.id, lia.id)).toBe(true);
    expect((await buscarEventoPublicado(ibirapuera.slug))?.capaFotoId).toBeNull();
    expect(await capaAgora()).toEqual(automatica);

    // Excluída não pode ser escolhida de novo.
    expect(await definirCapaDoEvento(ibirapuera.id, lia.id, b.id)).toEqual({
      ok: false,
      motivo: "foto",
    });
  });

  it("colaborador e outro fotógrafo não definem a capa", async () => {
    const foto = prontas.at(-1)!;
    expect(await definirCapaDoEvento(ibirapuera.id, pedro.id, foto.id)).toEqual({
      ok: false,
      motivo: "evento",
    });
    expect(await definirCapaDoEvento(ibirapuera.id, clique.id, foto.id)).toEqual({
      ok: false,
      motivo: "evento",
    });
    expect(await definirCapaDoEvento(ibirapuera.id, clique.id, null)).toEqual({
      ok: false,
      motivo: "evento",
    });
    expect((await buscarEventoPublicado(ibirapuera.slug))?.capaFotoId).toBeNull();
  });

  it("foto de outro evento, em processamento ou inexistente é recusada", async () => {
    expect(await definirCapaDoEvento(ibirapuera.id, lia.id, fotoDeOutroEvento.id)).toEqual({
      ok: false,
      motivo: "foto",
    });
    const processando = prontas.at(-2)!;
    await mudarFoto(processando.id, { status: "processando" });
    expect(await definirCapaDoEvento(ibirapuera.id, lia.id, processando.id)).toEqual({
      ok: false,
      motivo: "foto",
    });
    await mudarFoto(processando.id, { status: "pronta" });
    expect(
      await definirCapaDoEvento(ibirapuera.id, lia.id, "00000000-0000-4000-8000-000000000000"),
    ).toEqual({ ok: false, motivo: "foto" });
    // O dono também não usa a foto do próprio evento A como capa do evento B.
    const doIbirapuera = prontas[0];
    expect(await definirCapaDoEvento(outroEvento.id, lia.id, doIbirapuera.id)).toEqual({
      ok: false,
      motivo: "foto",
    });
    expect((await buscarEventoPublicado(ibirapuera.slug))?.capaFotoId).toBeNull();
  });
});
