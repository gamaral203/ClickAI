import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  adicionarColaborador,
  atualizarEvento,
  buscarEventoDoFotografo,
  definirCapaDoEvento,
  excluirEventoSemPedidos,
  listarColaboracoes,
  listarEventosPublicados,
  listarItensDoPainel,
  listarMeusEventos,
  listarOpcoesFiltroEventos,
  mudarLiberacao,
  mudarStatusDoEvento,
  responderConvite,
} from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";

const [lia, pedro, clique] = fotografos;
// Evento da Lia, publicado e listado; o Pedro colabora com o convite aceito (dados de exemplo).
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;
const AGORA = Date.parse("2026-10-11T12:00:00.000Z");

describe("Meus eventos com colaboração", () => {
  it("o colaborador aceito vê o evento do dono, com o selo e só os números dele", async () => {
    const meus = await listarMeusEventos(pedro.id, AGORA);
    const doIbirapuera = meus.filter((e) => e.id === ibirapuera.id);
    expect(doIbirapuera).toHaveLength(1);
    expect(doIbirapuera[0].colaboracao).toEqual({ donoNome: lia.nomePublico });

    // As contagens do colaborador são só das fotos que ele enviou.
    const doDono = (await listarMeusEventos(lia.id, AGORA)).find((e) => e.id === ibirapuera.id)!;
    expect(doIbirapuera[0].totalItens).toBeGreaterThan(0);
    expect(doIbirapuera[0].totalItens).toBeLessThan(doDono.totalItens);
    // Os eventos do próprio Pedro continuam sem selo.
    for (const e of meus.filter((e) => e.fotografoId === pedro.id)) {
      expect(e.colaboracao).toBeNull();
    }
  });

  it("o dono continua vendo o evento, sem selo e sem repetir", async () => {
    const meus = await listarMeusEventos(lia.id, AGORA);
    const doIbirapuera = meus.filter((e) => e.id === ibirapuera.id);
    expect(doIbirapuera).toHaveLength(1);
    expect(doIbirapuera[0].colaboracao).toBeNull();
    expect(new Set(meus.map((e) => e.id)).size).toBe(meus.length);
    // Mesmos eventos de que a Lia é dona, nem mais nem menos.
    const daLia = eventos.filter((e) => e.fotografoId === lia.id).map((e) => e.id);
    expect(meus.map((e) => e.id).sort()).toEqual([...daLia].sort());
  });

  it("convite pendente ou recusado não põe o evento em Meus eventos", async () => {
    expect(
      await adicionarColaborador(ibirapuera.id, lia.id, {
        fotografoId: clique.id,
        comissaoDonoPct: 20,
        nota: null,
      }),
    ).toBe("ok");
    expect((await listarMeusEventos(clique.id, AGORA)).some((e) => e.id === ibirapuera.id)).toBe(
      false,
    );
    expect(
      (await listarEventosPublicados({ fotografoId: clique.id })).some(
        (e) => e.id === ibirapuera.id,
      ),
    ).toBe(false);

    const convite = (await listarColaboracoes(clique.id)).find(
      (c) => c.evento.id === ibirapuera.id,
    )!;
    expect(await responderConvite(convite.colaboradorId, clique.id, false)).toBe(true);
    expect((await listarMeusEventos(clique.id, AGORA)).some((e) => e.id === ibirapuera.id)).toBe(
      false,
    );
  });

  it("o colaborador não ganha nenhuma ação de dono", async () => {
    expect(await buscarEventoDoFotografo(ibirapuera.id, pedro.id)).toBeNull();
    expect(await listarItensDoPainel(ibirapuera.id, pedro.id)).toBeNull();
    expect(await atualizarEvento(ibirapuera.id, pedro.id, { titulo: "Invadido" })).toBeNull();
    expect(await mudarStatusDoEvento(ibirapuera.id, pedro.id, "publicado", "arquivado")).toBe(
      false,
    );
    expect(await definirCapaDoEvento(ibirapuera.id, pedro.id, null)).toEqual({
      ok: false,
      motivo: "evento",
    });
    expect(
      await mudarLiberacao(ibirapuera.id, pedro.id, { acao: "liberar" }, null, AGORA),
    ).toBeNull();
    expect(await excluirEventoSemPedidos(ibirapuera.id, pedro.id)).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
    // Nada mudou no evento.
    const doDono = await buscarEventoDoFotografo(ibirapuera.id, lia.id);
    expect(doDono?.titulo).toBe(ibirapuera.titulo);
    expect(doDono?.status).toBe("publicado");
  });
});

describe("página pública do fotógrafo", () => {
  it("lista também o evento publicado em que ele colabora, sem repetir", async () => {
    const doPedro = await listarEventosPublicados({ fotografoId: pedro.id });
    expect(doPedro.filter((e) => e.id === ibirapuera.id)).toHaveLength(1);
    const opcoes = await listarOpcoesFiltroEventos(pedro.id);
    expect(opcoes.cidades.some((c) => c.nome === ibirapuera.cidade)).toBe(true);

    const daLia = await listarEventosPublicados({ fotografoId: lia.id });
    expect(daLia.filter((e) => e.id === ibirapuera.id)).toHaveLength(1);
  });
});
