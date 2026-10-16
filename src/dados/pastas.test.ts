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
  adicionarItensSimulados,
  criarEvento,
  criarPasta,
  excluirPasta,
  listarFotosDoEvento,
  listarOpcoesGaleria,
  listarPastasDoPainel,
  moverItensParaPasta,
  moverPasta,
  mudarStatusDoEvento,
  pastaDoEventoDoDono,
  renomearPasta,
  reordenarPasta,
  type Pasta,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { pastasDoFiltro } from "@/lib/galeria";
import { pastaDeDestino } from "@/servicos/envios";

const [lia, outro] = fotografos;

let n = 0;
async function novoEvento(dono = lia.id) {
  n++;
  const evento = await criarEvento(dono, {
    titulo: `Evento com pastas ${n}`,
    slug: `evento-pastas-${n}-${crypto.randomUUID().slice(0, 8)}`,
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

async function enviar(eventoId: string, quantas: number, pastaId: string | null = null) {
  const arquivos = Array.from({ length: quantas }, (_, i) => ({
    nome: `IMG_${i}.jpg`,
    tamanhoBytes: 1000,
  }));
  return (await adicionarItensSimulados(eventoId, lia.id, arquivos, null, pastaId))!;
}

async function pastaDasFotos(ids: string[]) {
  const banco = await obterBanco();
  const linhas = await banco
    .select({ id: t.fotos.id, pastaId: t.fotos.pastaId })
    .from(t.fotos)
    .where(inArray(t.fotos.id, ids));
  return new Set(linhas.map((l) => l.pastaId));
}

describe("subpastas: até 2 níveis", () => {
  it("cria subpasta e recusa o 3º nível e a pasta de cima de outro evento", async () => {
    const evento = await novoEvento();
    const outroEvento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    expect(bateria).toMatchObject({ pastaPaiId: largada.id, ordem: 1 });

    expect(await criarPasta(evento.id, lia.id, "Fundo", bateria.id)).toEqual({
      erro: expect.stringContaining("3º nível"),
    });
    const deFora = await pasta(outroEvento.id, "De fora");
    expect(await criarPasta(evento.id, lia.id, "Errada", deFora.id)).toEqual({
      erro: "Pasta não encontrada.",
    });

    const arvore = await listarPastasDoPainel(evento.id, lia.id);
    expect(arvore?.map((p) => [p.caminho, p.nivel])).toEqual([
      ["Largada", 1],
      ["Largada › Bateria 1", 2],
    ]);
  });

  it("o gatilho do banco também recusa o 3º nível e a pasta de cima de outro evento", async () => {
    const evento = await novoEvento();
    const outroEvento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    const deFora = await pasta(outroEvento.id, "De fora");
    const banco = await obterBanco();
    await expect(
      banco
        .insert(t.pastas)
        .values({ eventoId: evento.id, pastaPaiId: bateria.id, nome: "Fundo", ordem: 1 }),
    ).rejects.toThrow();
    await expect(
      banco
        .insert(t.pastas)
        .values({ eventoId: evento.id, pastaPaiId: deFora.id, nome: "Errada", ordem: 1 }),
    ).rejects.toThrow();
    // Pasta com subpasta não vira subpasta nem por UPDATE direto.
    const chegada = await pasta(evento.id, "Chegada");
    await expect(
      banco.update(t.pastas).set({ pastaPaiId: chegada.id }).where(eq(t.pastas.id, largada.id)),
    ).rejects.toThrow();
  });

  it("move respeitando os níveis", async () => {
    const evento = await novoEvento();
    const outroEvento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const chegada = await pasta(evento.id, "Chegada");
    const percurso = await pasta(evento.id, "Percurso");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    const deFora = await pasta(outroEvento.id, "De fora");

    // Nível 1 sem filhas para dentro de outra.
    expect(await moverPasta(percurso.id, lia.id, chegada.id)).toEqual({});
    // Nível 1 com filhas não vira subpasta.
    expect((await moverPasta(largada.id, lia.id, chegada.id)).erro).toBeTruthy();
    // Nada vai para dentro de uma subpasta, nem para outro evento, nem para dentro dela mesma.
    expect((await moverPasta(chegada.id, lia.id, bateria.id)).erro).toBeTruthy();
    expect((await moverPasta(bateria.id, lia.id, deFora.id)).erro).toBeTruthy();
    expect((await moverPasta(chegada.id, lia.id, chegada.id)).erro).toBeTruthy();
    // Subpasta para outra pasta e para fora (nível 1).
    expect(await moverPasta(bateria.id, lia.id, chegada.id)).toEqual({});
    expect(await moverPasta(percurso.id, lia.id, null)).toEqual({});

    const arvore = await listarPastasDoPainel(evento.id, lia.id);
    expect(arvore?.map((p) => p.caminho)).toEqual([
      "Largada",
      "Chegada",
      "Chegada › Bateria 1",
      "Percurso",
    ]);
  });

  it("reordena só dentro do mesmo nível", async () => {
    const evento = await novoEvento();
    const a = await pasta(evento.id, "A");
    const b = await pasta(evento.id, "B");
    const a1 = await pasta(evento.id, "A1", a.id);
    await pasta(evento.id, "A2", a.id);
    expect(await reordenarPasta(b.id, lia.id, "subir")).toBe(true);
    expect(await reordenarPasta(a1.id, lia.id, "descer")).toBe(true);
    // Já é a primeira: não muda nada.
    expect(await reordenarPasta(b.id, lia.id, "subir")).toBe(true);
    const arvore = await listarPastasDoPainel(evento.id, lia.id);
    expect(arvore?.map((p) => p.caminho)).toEqual(["B", "A", "A › A2", "A › A1"]);
  });

  it("excluir a pasta de cima apaga as subpastas e deixa as fotos sem pasta", async () => {
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    const chegada = await pasta(evento.id, "Chegada");
    const naPai = await enviar(evento.id, 2, largada.id);
    const naSub = await enviar(evento.id, 3, bateria.id);
    const naOutra = await enviar(evento.id, 1, chegada.id);

    const painel = await listarPastasDoPainel(evento.id, lia.id);
    expect(painel?.find((p) => p.id === largada.id)).toMatchObject({
      totalItens: 2,
      totalComSubpastas: 5,
      subpastas: 1,
    });

    expect(await excluirPasta(largada.id, lia.id)).toEqual({ subpastas: 1, fotos: 5 });
    const banco = await obterBanco();
    const restantes = await banco
      .select({ id: t.pastas.id })
      .from(t.pastas)
      .where(eq(t.pastas.eventoId, evento.id));
    expect(restantes.map((p) => p.id)).toEqual([chegada.id]);
    // As fotos continuam, sem pasta; as da outra pasta não mudam.
    expect(await pastaDasFotos([...naPai, ...naSub].map((f) => f.id))).toEqual(new Set([null]));
    expect(await pastaDasFotos(naOutra.map((f) => f.id))).toEqual(new Set([chegada.id]));
    const todas = await listarFotosDoEvento(evento.id, { pagina: 1, limite: 48 });
    expect(todas.total).toBe(6);
  });

  it("a galeria filtra a pasta com as subpastas e a subpasta sozinha", async () => {
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const b1 = await pasta(evento.id, "Bateria 1", largada.id);
    const b2 = await pasta(evento.id, "Bateria 2", largada.id);
    const chegada = await pasta(evento.id, "Chegada");
    const naPai = await enviar(evento.id, 1, largada.id);
    const em1 = await enviar(evento.id, 2, b1.id);
    const em2 = await enviar(evento.id, 3, b2.id);
    await enviar(evento.id, 4, chegada.id);
    await enviar(evento.id, 5);

    const ids = async (pastaId: string, pagina = 1, limite = 48) =>
      (await listarFotosDoEvento(evento.id, { pagina, limite, filtro: { pasta: pastaId } })).fotos
        .map((f) => f.id)
        .sort();
    expect(await ids(largada.id)).toEqual([...naPai, ...em1, ...em2].map((f) => f.id).sort());
    expect(await ids(b1.id)).toEqual(em1.map((f) => f.id).sort());
    expect(await ids(chegada.id)).toHaveLength(4);
    // A paginação continua valendo com o filtro da pasta.
    const p2 = await listarFotosDoEvento(evento.id, {
      pagina: 2,
      limite: 4,
      filtro: { pasta: largada.id },
    });
    expect(p2).toMatchObject({ pagina: 2, totalPaginas: 2, total: 6 });
    expect(p2.fotos).toHaveLength(2);

    const opcoes = await listarOpcoesGaleria(evento.id);
    expect(opcoes.pastas.map((p) => [p.nome, p.nivel, p.total])).toEqual([
      ["Largada", 1, 6],
      ["Bateria 1", 2, 2],
      ["Bateria 2", 2, 3],
      ["Chegada", 1, 4],
    ]);
    expect(opcoes.pastas.find((p) => p.id === b2.id)?.pastaPaiId).toBe(largada.id);
  });

  it("uma pasta só com fotos já mostra o chip; a subpasta vazia fica escondida", async () => {
    // Caso real: a pasta LARGADA com as 2 fotos e a subpasta PRIMEIRA LARGADA vazia.
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "LARGADA");
    await pasta(evento.id, "PRIMEIRA LARGADA", largada.id);
    await enviar(evento.id, 2, largada.id);

    const opcoes = await listarOpcoesGaleria(evento.id);
    expect(opcoes.pastas.map((p) => [p.nome, p.nivel, p.total])).toEqual([["LARGADA", 1, 2]]);
    expect(pastasDoFiltro(opcoes.pastas)?.map((p) => p.nome)).toEqual(["LARGADA"]);

    // Fotos só na subpasta: o chip do nível 1 aparece com o total das subpastas.
    const outroEvento = await novoEvento();
    const chegada = await pasta(outroEvento.id, "Chegada");
    const b1 = await pasta(outroEvento.id, "Bateria 1", chegada.id);
    await pasta(outroEvento.id, "Vazia");
    await enviar(outroEvento.id, 3, b1.id);
    await enviar(outroEvento.id, 1);
    const filtro = pastasDoFiltro((await listarOpcoesGaleria(outroEvento.id)).pastas);
    expect(filtro?.map((p) => [p.nome, p.nivel, p.total])).toEqual([
      ["Chegada", 1, 3],
      ["Bateria 1", 2, 3],
    ]);

    // Sem nenhuma pasta com fotos visíveis, nada de filtro (só "Todas as fotos").
    const semFotos = await novoEvento();
    await pasta(semFotos.id, "Largada");
    await enviar(semFotos.id, 2);
    expect(pastasDoFiltro((await listarOpcoesGaleria(semFotos.id)).pastas)).toBeNull();
  });

  it("envio e mover fotos aceitam subpasta do mesmo evento", async () => {
    const evento = await novoEvento();
    const outroEvento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    const deFora = await pasta(outroEvento.id, "De fora");

    expect(await pastaDeDestino(evento.id, bateria.id, lia.id)).toBe(bateria.id);
    expect(await pastaDeDestino(evento.id, null, lia.id)).toBeNull();
    expect(await pastaDeDestino(evento.id, deFora.id, lia.id)).toBe(false);
    expect(await pastaDeDestino(evento.id, "nao-e-uuid", lia.id)).toBe(false);
    // Só o dono do evento escolhe a pasta (nem colaborador nem outro fotógrafo).
    expect(await pastaDeDestino(evento.id, bateria.id, outro.id)).toBe(false);

    const fotos = await enviar(evento.id, 2, bateria.id);
    expect(await pastaDasFotos(fotos.map((f) => f.id))).toEqual(new Set([bateria.id]));
    expect(await moverItensParaPasta([fotos[0].id], largada.id, lia.id)).toBe(true);
    expect(await moverItensParaPasta([fotos[0].id], deFora.id, lia.id)).toBe(false);
  });

  it("permissões: outro fotógrafo não lista, cria, renomeia, move nem exclui", async () => {
    const evento = await novoEvento();
    const largada = await pasta(evento.id, "Largada");
    const bateria = await pasta(evento.id, "Bateria 1", largada.id);
    const fotos = await enviar(evento.id, 1, largada.id);
    const deOutro = await novoEvento(outro.id);
    const r = await criarPasta(deOutro.id, outro.id, "Dele");
    if ("erro" in r) throw new Error(r.erro);

    expect(await listarPastasDoPainel(evento.id, outro.id)).toBeNull();
    expect(await criarPasta(evento.id, outro.id, "Intrusa")).toEqual({
      erro: "Evento não encontrado.",
    });
    // Subpasta no próprio evento dele, mas com a pasta de cima de outro dono: recusada.
    expect(await criarPasta(deOutro.id, outro.id, "Intrusa", largada.id)).toEqual({
      erro: "Pasta não encontrada.",
    });
    expect(await renomearPasta(largada.id, outro.id, "Trocada")).toBe(false);
    expect((await moverPasta(bateria.id, outro.id, null)).erro).toBeTruthy();
    expect((await moverPasta(r.pasta.id, outro.id, largada.id)).erro).toBeTruthy();
    expect(await reordenarPasta(largada.id, outro.id, "descer")).toBe(false);
    expect(await excluirPasta(largada.id, outro.id)).toBeNull();
    expect(await moverItensParaPasta([fotos[0].id], null, outro.id)).toBe(false);
    expect(await pastaDoEventoDoDono(evento.id, largada.id, outro.id)).toBe(false);

    const arvore = await listarPastasDoPainel(evento.id, lia.id);
    expect(arvore?.map((p) => p.caminho)).toEqual(["Largada", "Largada › Bateria 1"]);
    expect(await pastaDasFotos([fotos[0].id])).toEqual(new Set([largada.id]));
  });
});
