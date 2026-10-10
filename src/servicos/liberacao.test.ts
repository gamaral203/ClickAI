import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { FotografoConta } from "@/dados/tipos";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// A Server Action pede o fotógrafo logado; aqui a conta é escolhida pelo teste.
const sessao = vi.hoisted(() => ({ conta: null as unknown as FotografoConta }));
vi.mock("@/servicos/sessao", () => ({
  exigirFotografo: async () => ({ conta: sessao.conta }),
}));

import { mudarLiberacaoAcao } from "@/app/(fotografo)/painel/eventos/liberacao-acoes";
import {
  adicionarColaborador,
  adicionarItensSimulados,
  buscarEventoPublicado,
  buscarFotoPublica,
  buscarItensParaCompra,
  criarEvento,
  fotosEncontradas,
  listarColaboracoes,
  listarFotosDoEvento,
  listarMensagens,
  listarItensDoPainel,
  mudarStatusDoEvento,
  responderConvite,
  resumoDaLiberacao,
  type Foto,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import {
  estadoDaLiberacao,
  instanteDoCampo,
  liberacaoDoLote,
  type EscolhaLiberacao,
} from "@/lib/liberacao";

import { avisarLotesLiberados } from "./mensagens";
import { criarPedido } from "./pedidos";

const [lia, pedro, clique] = fotografos;

// "Agora" dos testes: 10/10/2026 às 15:00 em Brasília (18:00 UTC).
const QUINZE_HORAS = Date.parse("2026-10-10T18:00:00Z");
const DEZESSEIS_HORAS_UTC = Date.parse("2026-10-10T19:00:00Z");

function relogio(instante: number) {
  vi.setSystemTime(instante);
}

afterEach(() => {
  vi.useRealTimers();
});

let n = 0;
/** Evento novo e publicado da Lia, com o Pedro como colaborador que aceitou. */
async function novoEvento(padrao: {
  liberacao: "automatica" | "manual" | "agendada";
  liberadoEm?: string;
}) {
  n++;
  const evento = await criarEvento(lia.id, {
    titulo: `Evento de liberação ${n}`,
    slug: `evento-liberacao-${n}-${crypto.randomUUID().slice(0, 8)}`,
    categoriaId: categorias[0].id,
    inicioEm: "2026-10-10T08:00:00-03:00",
    fimEm: "2026-10-10T12:00:00-03:00",
    local: "Parque",
    cidade: "São Paulo",
    estado: "SP",
    precoFotoCentavos: 1500,
    precoVideoCentavos: 3000,
    visibilidade: "publico",
    listado: true,
    fotosSoAposBusca: false,
    liberacao: padrao.liberacao,
    liberadoEm: padrao.liberadoEm ?? null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: "envio",
  });
  expect(await mudarStatusDoEvento(evento.id, lia.id, "rascunho", "publicado")).toBe(true);
  expect(
    await adicionarColaborador(evento.id, lia.id, {
      fotografoId: pedro.id,
      comissaoDonoPct: 10,
      nota: null,
    }),
  ).toBe("ok");
  const convite = (await listarColaboracoes(pedro.id)).find((c) => c.evento.id === evento.id)!;
  expect(await responderConvite(convite.colaboradorId, pedro.id, true)).toBe(true);
  return evento;
}

async function enviar(
  eventoId: string,
  quantas: number,
  escolha: EscolhaLiberacao | null,
  quem = lia.id,
): Promise<Foto[]> {
  const arquivos = Array.from({ length: quantas }, (_, i) => ({
    nome: `IMG_${i}.jpg`,
    tamanhoBytes: 1000,
  }));
  return (await adicionarItensSimulados(eventoId, quem, arquivos, escolha))!;
}

async function idsNaGaleria(eventoId: string) {
  return (await listarFotosDoEvento(eventoId, { limite: 500 })).fotos.map((f) => f.id);
}

async function idsAVenda(ids: string[]) {
  return (await buscarItensParaCompra(ids)).map((i) => i.foto.id);
}

function comprar(ids: string[]) {
  return criarPedido(ids, {
    clienteId: null,
    nome: "Cliente Teste",
    email: "cliente@teste.com",
    whatsapp: null,
    aceitaWhatsapp: false,
    metodo: "pix",
  });
}

beforeAll(() => {
  sessao.conta = lia as FotografoConta;
});

describe("regras puras da liberação", () => {
  it("16:00 em Brasília é 19:00 UTC", () => {
    expect(instanteDoCampo("2026-10-10T16:00")?.toISOString()).toBe("2026-10-10T19:00:00.000Z");
    expect(instanteDoCampo("10/10/2026 16:00")).toBeNull();
  });

  it("estado: manual sem horário, agendada antes do horário, liberada a partir dele", () => {
    expect(estadoDaLiberacao(null, QUINZE_HORAS)).toBe("manual");
    expect(estadoDaLiberacao("2026-10-10T19:00:00Z", DEZESSEIS_HORAS_UTC - 1)).toBe("agendada");
    expect(estadoDaLiberacao("2026-10-10T19:00:00Z", DEZESSEIS_HORAS_UTC)).toBe("liberada");
  });

  it("lote: escolha do envio vence o padrão; sem escolha vale o padrão do evento", () => {
    const agendado = { liberacao: "agendada" as const, liberadoEm: "2026-10-10T19:00:00Z" };
    expect(liberacaoDoLote(agendado, null, QUINZE_HORAS).liberarEm?.getTime()).toBe(
      DEZESSEIS_HORAS_UTC,
    );
    expect(liberacaoDoLote(agendado, { modo: "manual" }, QUINZE_HORAS)).toEqual({
      liberacao: "manual",
      liberarEm: null,
    });
    expect(
      liberacaoDoLote(agendado, { modo: "automatica" }, QUINZE_HORAS).liberarEm?.getTime(),
    ).toBe(QUINZE_HORAS);
    // Padrão agendado sem horário: aguarda o dono.
    expect(
      liberacaoDoLote({ liberacao: "agendada", liberadoEm: null }, null, QUINZE_HORAS),
    ).toEqual({
      liberacao: "manual",
      liberarEm: null,
    });
  });
});

describe("liberação das fotos no banco", () => {
  it("automática: a foto aparece assim que fica pronta, na galeria, na busca e no checkout", async () => {
    const evento = await novoEvento({ liberacao: "manual" });
    const fotos = await enviar(evento.id, 2, { modo: "automatica" });
    const ids = fotos.map((f) => f.id);
    expect(await idsNaGaleria(evento.id)).toEqual(ids);
    expect(await idsAVenda(ids)).toEqual(expect.arrayContaining(ids));
    expect(await buscarFotoPublica(ids[0])).not.toBeNull();
    expect((await fotosEncontradas(evento.id, ids)).map((f) => f.id)).toEqual(ids);
  });

  it("manual: fica só no painel até o dono liberar; liberar agora só as escolhidas", async () => {
    const evento = await novoEvento({ liberacao: "automatica" });
    const fotos = await enviar(evento.id, 3, { modo: "manual" });
    const ids = fotos.map((f) => f.id);

    // Nada público: galeria, página da foto, busca e checkout.
    expect(await idsNaGaleria(evento.id)).toEqual([]);
    expect(await buscarFotoPublica(ids[0])).toBeNull();
    expect(await fotosEncontradas(evento.id, ids)).toEqual([]);
    expect(await idsAVenda(ids)).toEqual([]);
    expect(await comprar([ids[0]])).toEqual({ ok: false, motivo: "itens_indisponiveis" });
    const resumo = await buscarEventoPublicado(evento.slug);
    expect(resumo?.situacaoGaleria).toEqual({ tipo: "aguardando_liberacao", liberaEm: null });
    expect(resumo?.totalItens).toBe(0);

    // O painel mostra todas, com o estado.
    const painel = await listarItensDoPainel(evento.id, lia.id);
    expect(painel?.map((f) => estadoDaLiberacao(f.liberarEm, Date.now()))).toEqual([
      "manual",
      "manual",
      "manual",
    ]);

    // Liberar agora só a primeira.
    expect(
      await mudarLiberacaoAcao({
        eventoId: evento.id,
        fotoIds: [ids[0]],
        mudanca: { acao: "liberar" },
      }),
    ).toEqual({ alteradas: 1 });
    expect(await idsNaGaleria(evento.id)).toEqual([ids[0]]);
    expect(await idsAVenda(ids)).toEqual([ids[0]]);
    expect((await comprar([ids[0]])).ok).toBe(true);
    expect(await resumoDaLiberacao(evento.id, Date.now())).toEqual({
      liberadas: 1,
      agendadas: 0,
      aguardando: 2,
      proximaEm: null,
    });

    // Liberar agora sem seleção: todas as pendentes.
    expect(await mudarLiberacaoAcao({ eventoId: evento.id, mudanca: { acao: "liberar" } })).toEqual(
      {
        alteradas: 2,
      },
    );
    expect(await idsNaGaleria(evento.id)).toHaveLength(3);
  });

  it("agendada: invisível antes do horário e visível no minuto exato, sem job", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    relogio(QUINZE_HORAS);
    const evento = await novoEvento({ liberacao: "automatica" });
    const fotos = await enviar(evento.id, 2, { modo: "agendada", em: "2026-10-10T16:00" });
    const ids = fotos.map((f) => f.id);
    expect(fotos[0].liberarEm).toBe("2026-10-10T19:00:00.000Z");

    relogio(DEZESSEIS_HORAS_UTC - 1000);
    expect(await idsNaGaleria(evento.id)).toEqual([]);
    expect(await idsAVenda(ids)).toEqual([]);
    expect(await fotosEncontradas(evento.id, ids)).toEqual([]);
    expect(await comprar(ids)).toEqual({ ok: false, motivo: "itens_indisponiveis" });
    expect((await buscarEventoPublicado(evento.slug))?.situacaoGaleria).toEqual({
      tipo: "aguardando_liberacao",
      liberaEm: "2026-10-10T19:00:00.000Z",
    });

    relogio(DEZESSEIS_HORAS_UTC);
    expect(await idsNaGaleria(evento.id)).toEqual(ids);
    expect(await idsAVenda(ids)).toEqual(expect.arrayContaining(ids));
    expect((await fotosEncontradas(evento.id, ids)).map((f) => f.id)).toEqual(ids);
    expect((await buscarEventoPublicado(evento.slug))?.totalItens).toBe(2);
  });

  it("lotes diferentes, horários diferentes; a galeria avisa da próxima liberação", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    relogio(QUINZE_HORAS);
    const evento = await novoEvento({
      liberacao: "agendada",
      liberadoEm: "2026-10-10T16:00:00-03:00",
    });
    const padrao = await enviar(evento.id, 1, null);
    const outroLote = await enviar(evento.id, 1, { modo: "agendada", em: "2026-10-10T17:30" });
    expect(padrao[0].liberarEm).toBe("2026-10-10T19:00:00.000Z");
    expect(outroLote[0].liberarEm).toBe("2026-10-10T20:30:00.000Z");

    relogio(DEZESSEIS_HORAS_UTC + 60_000);
    expect(await idsNaGaleria(evento.id)).toEqual([padrao[0].id]);
    expect((await buscarEventoPublicado(evento.slug))?.situacaoGaleria).toEqual({
      tipo: "aberta",
      proximaLiberacao: "2026-10-10T20:30:00.000Z",
    });
    expect(await resumoDaLiberacao(evento.id, Date.now())).toEqual({
      liberadas: 1,
      agendadas: 1,
      aguardando: 0,
      proximaEm: "2026-10-10T20:30:00.000Z",
    });
  });

  it("reagendar, cancelar (volta ao manual) e liberar agora antecipando", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    relogio(QUINZE_HORAS);
    const evento = await novoEvento({ liberacao: "automatica" });
    const [foto] = await enviar(evento.id, 1, { modo: "agendada", em: "2026-10-10T16:00" });

    // Horário no passado não é aceito: a tela oferece liberar agora.
    expect(
      await mudarLiberacaoAcao({
        eventoId: evento.id,
        mudanca: { acao: "agendar", em: "2026-10-10T14:59" },
      }),
    ).toMatchObject({ horarioPassado: true });

    expect(
      await mudarLiberacaoAcao({
        eventoId: evento.id,
        mudanca: { acao: "agendar", em: "2026-10-10T18:00" },
      }),
    ).toEqual({ alteradas: 1 });
    relogio(DEZESSEIS_HORAS_UTC);
    expect(await idsNaGaleria(evento.id)).toEqual([]);

    expect(
      await mudarLiberacaoAcao({ eventoId: evento.id, mudanca: { acao: "cancelar" } }),
    ).toEqual({
      alteradas: 1,
    });
    let painel = await listarItensDoPainel(evento.id, lia.id);
    expect(painel?.[0].liberarEm).toBeNull();

    expect(
      await mudarLiberacaoAcao({
        eventoId: evento.id,
        mudanca: { acao: "agendar", em: "2026-10-10T20:00" },
      }),
    ).toEqual({ alteradas: 1 });
    expect(await mudarLiberacaoAcao({ eventoId: evento.id, mudanca: { acao: "liberar" } })).toEqual(
      {
        alteradas: 1,
      },
    );
    expect(await idsNaGaleria(evento.id)).toEqual([foto.id]);

    // Foto já liberada não volta a ficar escondida.
    expect(
      await mudarLiberacaoAcao({ eventoId: evento.id, mudanca: { acao: "cancelar" } }),
    ).toEqual({
      alteradas: 0,
    });
    painel = await listarItensDoPainel(evento.id, lia.id);
    expect(estadoDaLiberacao(painel![0].liberarEm, Date.now())).toBe("liberada");
  });

  it("só o dono muda a liberação; o colaborador segue o padrão do evento", async () => {
    const evento = await novoEvento({ liberacao: "manual" });
    // O Pedro (colaborador) pede "automática", mas o padrão do dono vale.
    const [doPedro] = await enviar(evento.id, 1, { modo: "automatica" }, pedro.id);
    expect(doPedro.liberacao).toBe("manual");
    expect(doPedro.liberarEm).toBeNull();
    // Quem não é dono nem colaborador não envia.
    expect(
      await adicionarItensSimulados(evento.id, clique.id, [{ nome: "a.jpg", tamanhoBytes: 1 }]),
    ).toBeNull();

    for (const conta of [pedro, clique]) {
      sessao.conta = conta as FotografoConta;
      expect(
        await mudarLiberacaoAcao({ eventoId: evento.id, mudanca: { acao: "liberar" } }),
      ).toEqual({ erro: "Evento não encontrado." });
    }
    sessao.conta = lia as FotografoConta;
    expect(await idsNaGaleria(evento.id)).toEqual([]);

    // Ids de fotos de outro evento na seleção não mudam nada (sem IDOR).
    const outro = await novoEvento({ liberacao: "automatica" });
    const [deOutro] = await enviar(outro.id, 1, { modo: "manual" });
    expect(
      await mudarLiberacaoAcao({
        eventoId: evento.id,
        fotoIds: [deOutro.id],
        mudanca: { acao: "liberar" },
      }),
    ).toEqual({ alteradas: 0 });
    expect(await idsNaGaleria(outro.id)).toEqual([]);

    // Entrada inválida é recusada pelo Zod.
    expect(
      await mudarLiberacaoAcao({ eventoId: "x", mudanca: { acao: "liberar" } }),
    ).toHaveProperty("erro");
  });

  it("aviso do lote agendado: sai uma vez para o dono e os colaboradores, depois do horário", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    relogio(QUINZE_HORAS);
    const evento = await novoEvento({ liberacao: "automatica" });
    await enviar(evento.id, 2, { modo: "agendada", em: "2026-10-10T16:00" });
    const doEvento = async () =>
      (await listarMensagens(1000)).filter(
        (m) => m.tipo === "liberacao" && m.assunto.includes(evento.titulo),
      );

    // Antes do horário, nada deste evento (lotes de outros testes podem sair).
    await avisarLotesLiberados(DEZESSEIS_HORAS_UTC - 1000);
    expect(await doEvento()).toHaveLength(0);
    expect(await avisarLotesLiberados(DEZESSEIS_HORAS_UTC)).toBeGreaterThanOrEqual(2);
    expect(await doEvento()).toHaveLength(2);
    // Repetir o job não repete o aviso.
    expect(await avisarLotesLiberados(DEZESSEIS_HORAS_UTC + 600_000)).toBe(0);
    expect(await doEvento()).toHaveLength(2);
    expect((await doEvento()).map((m) => m.para).sort()).toEqual([
      "lia@exemplo.com",
      "pedro@exemplo.com",
    ]);
  });
});
