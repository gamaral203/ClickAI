import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// `connection()` e `cookies()` só existem dentro de uma requisição do Next.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { obterBanco } from "@/db";
import * as t from "@/db/schema";
import {
  adicionarColaborador,
  adicionarItensSimulados,
  contarFotosDoFiltro,
  criarEvento,
  criarPasta,
  listarItensDoPainel,
  listarPastasDoPainel,
  moverFotosDoPainel,
  mudarStatusDoEvento,
  responderConvite,
  type Pasta,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import {
  diasComFotos,
  FILTRO_PADRAO,
  filtrarItensDoPainel,
  type FiltroDoPainel,
} from "@/lib/filtro-painel";

// "Mover para…" do painel do evento (docs/arquitetura.md, "Pastas e subpastas"): por ids ou por
// filtro (reavaliado no servidor), só o dono, só pastas do mesmo evento.

const [lia, outro] = fotografos;

let n = 0;
async function novoEvento(dono = lia.id) {
  n++;
  const evento = await criarEvento(dono, {
    titulo: `Evento mover ${n}`,
    slug: `evento-mover-${n}-${crypto.randomUUID().slice(0, 8)}`,
    categoriaId: categorias[0].id,
    inicioEm: "2026-10-15T08:00:00-03:00",
    fimEm: "2026-10-16T18:00:00-03:00",
    local: "Parque",
    cidade: "São Paulo",
    estado: "SP",
    precoFotoCentavos: 1500,
    precoVideoCentavos: 3000,
    visibilidade: "publico",
    listado: true,
    liberacao: "automatica",
    liberadoEm: null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: "envio",
  });
  expect(await mudarStatusDoEvento(evento.id, dono, "rascunho", "publicado")).toBe(true);
  return evento;
}

async function pasta(eventoId: string, nome: string, pai: string | null = null): Promise<Pasta> {
  const r = await criarPasta(eventoId, lia.id, nome, pai);
  if ("erro" in r) throw new Error(r.erro);
  return r.pasta;
}

/** Envia `quantas` fotos com a data de envio e a de captura escolhidas. */
async function enviar(
  eventoId: string,
  quantas: number,
  datas: { criadoEm: string; capturadaEm?: string | null },
  pastaId: string | null = null,
) {
  const arquivos = Array.from({ length: quantas }, (_, i) => ({
    nome: `IMG_${i}.jpg`,
    tamanhoBytes: 1000,
  }));
  const fotos = (await adicionarItensSimulados(eventoId, lia.id, arquivos, null, pastaId))!;
  const banco = await obterBanco();
  await banco
    .update(t.fotos)
    .set({
      criadoEm: new Date(datas.criadoEm),
      capturadaEm: datas.capturadaEm ? new Date(datas.capturadaEm) : null,
    })
    .where(
      inArray(
        t.fotos.id,
        fotos.map((f) => f.id),
      ),
    );
  return fotos.map((f) => f.id);
}

async function pastasDasFotos(ids: string[]) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotos.id, pastaId: t.fotos.pastaId })
    .from(t.fotos)
    .where(inArray(t.fotos.id, ids));
  return new Set(linhas.map((l) => l.pastaId));
}

/** O que a tela conta para o filtro: a mesma função da grade, sobre a lista do painel. */
async function contagemDaTela(eventoId: string, filtro: FiltroDoPainel, agora = Date.now()) {
  const itens = (await listarItensDoPainel(eventoId, lia.id))!;
  const arvore = (await listarPastasDoPainel(eventoId, lia.id))!;
  return filtrarItensDoPainel(itens, filtro, arvore, agora).length;
}

const DIA_1 = { criadoEm: "2026-10-16T12:00:00-03:00", capturadaEm: "2026-10-15T09:00:00-03:00" };
const DIA_2 = { criadoEm: "2026-10-16T12:00:00-03:00", capturadaEm: "2026-10-16T09:00:00-03:00" };

describe("mover fotos para pasta no painel", () => {
  it("move por ids e devolve quantas moveu", async () => {
    const evento = await novoEvento();
    const ids = await enviar(evento.id, 4, DIA_1);
    const dia1 = await pasta(evento.id, "Dia 1");
    const r = await moverFotosDoPainel(
      evento.id,
      lia.id,
      { tipo: "ids", ids: ids.slice(0, 3) },
      dia1.id,
    );
    expect(r).toEqual({ movidas: 3 });
    expect(await pastasDasFotos(ids.slice(0, 3))).toEqual(new Set([dia1.id]));
    expect(await pastasDasFotos(ids.slice(3))).toEqual(new Set([null]));
  });

  it("move por filtro (sem pasta + dia da captura), com a contagem da tela igual à movida", async () => {
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const semPastaDia1 = await enviar(evento.id, 5, DIA_1);
    const semPastaDia2 = await enviar(evento.id, 3, DIA_2);
    const naPastaDia1 = await enviar(evento.id, 2, DIA_1, largada.id);
    const dia1 = await pasta(evento.id, "Dia 1");
    const filtro: FiltroDoPainel = {
      ...FILTRO_PADRAO,
      pasta: "sem",
      base: "captura",
      dia: "2026-10-15",
    };

    const naTela = await contagemDaTela(evento.id, filtro);
    expect(naTela).toBe(5);
    expect(await contarFotosDoFiltro(evento.id, lia.id, filtro)).toBe(naTela);
    const r = await moverFotosDoPainel(evento.id, lia.id, { tipo: "filtro", filtro }, dia1.id);
    expect(r).toEqual({ movidas: naTela });

    expect(await pastasDasFotos(semPastaDia1)).toEqual(new Set([dia1.id]));
    expect(await pastasDasFotos(semPastaDia2)).toEqual(new Set([null]));
    expect(await pastasDasFotos(naPastaDia1)).toEqual(new Set([largada.id]));
    // Reavaliado: o mesmo filtro agora não pega mais nada.
    expect(await contarFotosDoFiltro(evento.id, lia.id, filtro)).toBe(0);
  });

  it("pasta de nível 1 no filtro inclui as subpastas; foto excluída fica de fora", async () => {
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    const naLargada = await enviar(evento.id, 2, DIA_1, largada.id);
    const naBateria = await enviar(evento.id, 2, DIA_1, bateria.id);
    const banco = await obterBanco();
    await banco.update(t.fotos).set({ excluidaEm: new Date() }).where(eq(t.fotos.id, naBateria[1]));
    const destino = await pasta(evento.id, "Dia 1");
    const filtro: FiltroDoPainel = { ...FILTRO_PADRAO, pasta: largada.id };
    expect(await contagemDaTela(evento.id, filtro)).toBe(3);
    const r = await moverFotosDoPainel(evento.id, lia.id, { tipo: "filtro", filtro }, destino.id);
    expect(r).toEqual({ movidas: 3 });
    expect(await pastasDasFotos([...naLargada, naBateria[0]])).toEqual(new Set([destino.id]));
    expect(await pastasDasFotos([naBateria[1]])).toEqual(new Set([bateria.id]));
  });

  it("cria a pasta (inclusive subpasta) e já move para ela", async () => {
    const evento = await novoEvento();
    const ids = await enviar(evento.id, 3, DIA_2);
    const dias = await pasta(evento.id, "Dias");
    const nova = await criarPasta(evento.id, lia.id, "Dia 2", dias.id);
    if ("erro" in nova) throw new Error(nova.erro);
    const filtro: FiltroDoPainel = { ...FILTRO_PADRAO, dia: "2026-10-16" };
    const r = await moverFotosDoPainel(
      evento.id,
      lia.id,
      { tipo: "filtro", filtro },
      nova.pasta.id,
    );
    expect(r).toEqual({ movidas: 3 });
    expect(await pastasDasFotos(ids)).toEqual(new Set([nova.pasta.id]));
    const arvore = await listarPastasDoPainel(evento.id, lia.id);
    expect(arvore?.find((p) => p.id === nova.pasta.id)?.caminho).toBe("Dias › Dia 2");
  });

  it('"Sem pasta" tira da pasta', async () => {
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const ids = await enviar(evento.id, 3, DIA_1, largada.id);
    const filtro: FiltroDoPainel = { ...FILTRO_PADRAO, pasta: largada.id };
    expect(await moverFotosDoPainel(evento.id, lia.id, { tipo: "filtro", filtro }, null)).toEqual({
      movidas: 3,
    });
    expect(await pastasDasFotos(ids)).toEqual(new Set([null]));
  });

  it("recusa evento alheio, pasta de outro evento, foto de outro evento e o colaborador", async () => {
    const evento = await novoEvento();
    const outroEvento = await novoEvento();
    const ids = await enviar(evento.id, 2, DIA_1);
    const idsDoOutro = await enviar(outroEvento.id, 1, DIA_1);
    const daqui = await pasta(evento.id, "Dia 1");
    const deLa = await pasta(outroEvento.id, "Dia 1");
    const filtro: FiltroDoPainel = { ...FILTRO_PADRAO };

    // Outro fotógrafo no evento da Lia: nem por ids nem por filtro.
    expect(
      await moverFotosDoPainel(evento.id, outro.id, { tipo: "filtro", filtro }, daqui.id),
    ).toEqual({ erro: "Evento não encontrado." });
    expect(await contarFotosDoFiltro(evento.id, outro.id, filtro)).toBeNull();
    // Pasta de outro evento (mesmo dono) como destino.
    expect(
      "erro" in (await moverFotosDoPainel(evento.id, lia.id, { tipo: "ids", ids }, deLa.id)),
    ).toBe(true);
    // Pasta de outro evento no filtro.
    expect(
      "erro" in
        (await moverFotosDoPainel(
          evento.id,
          lia.id,
          { tipo: "filtro", filtro: { ...filtro, pasta: deLa.id } },
          daqui.id,
        )),
    ).toBe(true);
    // Um id de outro evento no meio: recusa o lote inteiro.
    expect(
      "erro" in
        (await moverFotosDoPainel(
          evento.id,
          lia.id,
          { tipo: "ids", ids: [...ids, ...idsDoOutro] },
          daqui.id,
        )),
    ).toBe(true);

    // Colaborador com o convite aceito: o mover em massa é só do dono.
    expect(
      await adicionarColaborador(evento.id, lia.id, {
        fotografoId: outro.id,
        comissaoDonoPct: 10,
        nota: null,
      }),
    ).toBe("ok");
    const banco = await obterBanco();
    const [convite] = await banco
      .select({ id: t.colaboradores.id })
      .from(t.colaboradores)
      .where(eq(t.colaboradores.eventoId, evento.id));
    expect(await responderConvite(convite.id, outro.id, true)).toBe(true);
    expect(
      await moverFotosDoPainel(evento.id, outro.id, { tipo: "filtro", filtro }, daqui.id),
    ).toEqual({ erro: "Evento não encontrado." });

    // Nada mudou.
    expect(await pastasDasFotos(ids)).toEqual(new Set([null]));
    expect(await pastasDasFotos(idsDoOutro)).toEqual(new Set([null]));
  });

  it("foto enviada às 23:30 de Brasília conta naquele dia, na tela e no servidor", async () => {
    const evento = await novoEvento();
    // 23:30 de 16/10 em Brasília = 02:30 de 17/10 em UTC.
    const tarde = await enviar(evento.id, 2, { criadoEm: "2026-10-16T23:30:00-03:00" });
    const madrugada = await enviar(evento.id, 1, { criadoEm: "2026-10-17T00:10:00-03:00" });
    const itens = (await listarItensDoPainel(evento.id, lia.id))!;
    expect(diasComFotos(itens, "envio")).toEqual([
      { dia: "2026-10-16", total: 2 },
      { dia: "2026-10-17", total: 1 },
    ]);
    // Sem EXIF: no dia da captura, elas ficam em "sem data".
    expect(diasComFotos(itens, "captura")).toEqual([{ dia: "sem-data", total: 3 }]);

    const dia16: FiltroDoPainel = { ...FILTRO_PADRAO, base: "envio", dia: "2026-10-16" };
    expect(await contagemDaTela(evento.id, dia16)).toBe(2);
    expect(await contarFotosDoFiltro(evento.id, lia.id, dia16)).toBe(2);
    const destino = await pasta(evento.id, "Dia 16");
    expect(
      await moverFotosDoPainel(evento.id, lia.id, { tipo: "filtro", filtro: dia16 }, destino.id),
    ).toEqual({ movidas: 2 });
    expect(await pastasDasFotos(tarde)).toEqual(new Set([destino.id]));
    expect(await pastasDasFotos(madrugada)).toEqual(new Set([null]));

    const semData: FiltroDoPainel = { ...FILTRO_PADRAO, base: "captura", dia: "sem-data" };
    expect(await contarFotosDoFiltro(evento.id, lia.id, semData)).toBe(3);
  });

  it("filtro pela liberação: só as que aguardam o dono", async () => {
    const evento = await novoEvento();
    const ids = await enviar(evento.id, 3, DIA_1);
    const banco = await obterBanco();
    await banco.update(t.fotos).set({ liberarEm: null }).where(eq(t.fotos.id, ids[0]));
    const destino = await pasta(evento.id, "Revisar");
    const filtro: FiltroDoPainel = { ...FILTRO_PADRAO, liberacao: "manual" };
    expect(await contagemDaTela(evento.id, filtro)).toBe(1);
    expect(
      await moverFotosDoPainel(evento.id, lia.id, { tipo: "filtro", filtro }, destino.id),
    ).toEqual({ movidas: 1 });
    expect(await pastasDasFotos([ids[0]])).toEqual(new Set([destino.id]));
    expect(await pastasDasFotos(ids.slice(1))).toEqual(new Set([null]));
  });
});
