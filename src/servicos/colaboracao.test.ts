import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  adicionarColaborador,
  atualizarColaborador,
  listarColaboracoes,
  podeEnviarAoEvento,
  responderConvite,
  topCliquesDoEvento,
  vendasDaSemanaPorEvento,
} from "@/dados";
import { eventos, fotografos } from "@/dados/exemplo/dados";

const [lia, pedro, clique] = fotografos;
// Evento da Lia; o Pedro já colabora (aceito nos dados de exemplo).
const ibirapuera = eventos.find((e) => e.slug === "corrida-ibirapuera-10k-2026")!;

async function conviteDe(fotografoId: string, eventoId: string) {
  return (await listarColaboracoes(fotografoId)).find((c) => c.evento.id === eventoId)!;
}

describe("convite para colaborar", () => {
  it("o convidado só envia fotos depois de aceitar, e só ele responde", async () => {
    expect(
      await adicionarColaborador(ibirapuera.id, lia.id, {
        fotografoId: clique.id,
        comissaoDonoPct: 20,
        nota: null,
      }),
    ).toBe("ok");
    const convite = await conviteDe(clique.id, ibirapuera.id);
    expect(convite.aceitoEm).toBeNull();
    expect(convite.comissaoDonoPct).toBe(20);
    expect(await podeEnviarAoEvento(ibirapuera.id, clique.id)).toBe(false);

    // Outro fotógrafo não responde pelo convidado.
    expect(await responderConvite(convite.colaboradorId, pedro.id, true)).toBe(false);

    // Antes do aceite, o dono ainda pode ajustar a comissão.
    expect(
      await atualizarColaborador(convite.colaboradorId, lia.id, {
        comissaoDonoPct: 15,
        nota: null,
      }),
    ).toBe("ok");

    expect(await responderConvite(convite.colaboradorId, clique.id, true)).toBe(true);
    expect(await podeEnviarAoEvento(ibirapuera.id, clique.id)).toBe(true);
    // Aceitar de novo não muda nada.
    expect(await responderConvite(convite.colaboradorId, clique.id, true)).toBe(false);

    // Depois do aceite, a comissão combinada não muda; a nota, sim.
    expect(
      await atualizarColaborador(convite.colaboradorId, lia.id, {
        comissaoDonoPct: 40,
        nota: null,
      }),
    ).toBe("comissao_aceita");
    expect(
      await atualizarColaborador(convite.colaboradorId, lia.id, {
        comissaoDonoPct: 15,
        nota: "Cobre a largada",
      }),
    ).toBe("ok");
    expect((await conviteDe(clique.id, ibirapuera.id)).comissaoDonoPct).toBe(15);
  });

  it("recusar apaga o convite pendente", async () => {
    const outro = eventos.find((e) => e.fotografoId === lia.id && e.id !== ibirapuera.id)!;
    await adicionarColaborador(outro.id, lia.id, {
      fotografoId: pedro.id,
      comissaoDonoPct: 10,
      nota: null,
    });
    const convite = await conviteDe(pedro.id, outro.id);
    expect(await responderConvite(convite.colaboradorId, pedro.id, false)).toBe(true);
    expect((await listarColaboracoes(pedro.id)).some((c) => c.evento.id === outro.id)).toBe(false);
  });
});

describe("rankings", () => {
  it("Top Cliques lista a equipe que aceitou, em ordem de fotos vendidas", async () => {
    const posicoes = await topCliquesDoEvento(ibirapuera.id);
    const ids = posicoes.map((p) => p.fotografoId);
    expect(ids).toContain(lia.id);
    expect(ids).toContain(pedro.id);
    for (let i = 1; i < posicoes.length; i++) {
      expect(posicoes[i - 1].vendidas).toBeGreaterThanOrEqual(posicoes[i].vendidas);
    }
  });

  it("vendas da semana vêm do maior para o menor", async () => {
    const vendas = await vendasDaSemanaPorEvento();
    for (let i = 1; i < vendas.length; i++) {
      expect(vendas[i - 1][1]).toBeGreaterThanOrEqual(vendas[i][1]);
    }
  });
});
