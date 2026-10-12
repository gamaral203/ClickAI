import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  buscarFotoPublica,
  criarEvento,
  listarFotosDoEvento,
  mudarStatusDoEvento,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import type { EscolhaLiberacao } from "@/lib/liberacao";

const [lia] = fotografos;
const QUINZE_HORAS = Date.parse("2026-10-10T18:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

let n = 0;
async function novoEvento(
  extra: Partial<{
    visibilidade: "publico" | "senha";
    ordenacao: "envio" | "captura";
  }> = {},
) {
  n++;
  const evento = await criarEvento(lia.id, {
    titulo: `Evento paginado ${n}`,
    slug: `evento-paginado-${n}-${crypto.randomUUID().slice(0, 8)}`,
    categoriaId: categorias[0].id,
    inicioEm: "2026-10-10T08:00:00-03:00",
    fimEm: "2026-10-10T12:00:00-03:00",
    local: "Parque",
    cidade: "São Paulo",
    estado: "SP",
    precoFotoCentavos: 1500,
    precoVideoCentavos: 3000,
    visibilidade: extra.visibilidade ?? "publico",
    listado: true,
    liberacao: "automatica",
    liberadoEm: null,
    filtroHorario: false,
    listarNaoIdentificadas: false,
    ordenacao: extra.ordenacao ?? "envio",
  });
  expect(await mudarStatusDoEvento(evento.id, lia.id, "rascunho", "publicado")).toBe(true);
  return evento;
}

async function enviar(eventoId: string, quantas: number, escolha: EscolhaLiberacao | null = null) {
  const arquivos = Array.from({ length: quantas }, (_, i) => ({
    nome: `IMG_${i}.jpg`,
    tamanhoBytes: 1000,
  }));
  return (await adicionarItensSimulados(eventoId, lia.id, arquivos, escolha))!;
}

async function pagina(eventoId: string, p: number) {
  return listarFotosDoEvento(eventoId, { pagina: p, limite: 48 });
}

describe("galeria em páginas numeradas", () => {
  it("130 fotos em páginas de 48: primeira, do meio e última, sem repetir nem pular", async () => {
    const evento = await novoEvento({ ordenacao: "captura" });
    const enviadas = await enviar(evento.id, 130);
    // Metade com o mesmo horário de captura: o desempate pelo id mantém a ordem estável.
    const banco = await obterBanco();
    await banco
      .update(t.fotos)
      .set({ capturadaEm: new Date("2026-10-10T10:00:00Z") })
      .where(
        inArray(
          t.fotos.id,
          enviadas.filter((_, i) => i % 2 === 0).map((f) => f.id),
        ),
      );

    const [p1, p2, p3] = [
      await pagina(evento.id, 1),
      await pagina(evento.id, 2),
      await pagina(evento.id, 3),
    ];
    expect([p1.fotos.length, p2.fotos.length, p3.fotos.length]).toEqual([48, 48, 34]);
    expect(p1).toMatchObject({ pagina: 1, totalPaginas: 3, total: 130 });
    expect(p2).toMatchObject({ pagina: 2, totalPaginas: 3, total: 130 });
    expect(p3).toMatchObject({ pagina: 3, totalPaginas: 3, total: 130 });

    const ids = [...p1.fotos, ...p2.fotos, ...p3.fotos].map((f) => f.id);
    expect(new Set(ids).size).toBe(130);
    expect(new Set(ids)).toEqual(new Set(enviadas.map((f) => f.id)));
    // Pedir de novo dá exatamente a mesma página.
    expect((await pagina(evento.id, 2)).fotos.map((f) => f.id)).toEqual(p2.fotos.map((f) => f.id));

    // A página da foto (para o "Voltar") e a navegação atravessando o limite da página.
    const ultimaDaPrimeira = p1.fotos[47].id;
    const foto = await buscarFotoPublica(ultimaDaPrimeira);
    expect(foto).toMatchObject({ posicao: 48, paginaNaGaleria: 1, proximaId: p2.fotos[0].id });
    expect(await buscarFotoPublica(p2.fotos[0].id)).toMatchObject({
      posicao: 49,
      paginaNaGaleria: 2,
      anteriorId: ultimaDaPrimeira,
    });
    expect(await buscarFotoPublica(p3.fotos.at(-1)!.id)).toMatchObject({
      posicao: 130,
      paginaNaGaleria: 3,
      proximaId: null,
    });
  });

  it("página inválida ou fora do intervalo vira 1 ou a última", async () => {
    const evento = await novoEvento();
    await enviar(evento.id, 50);
    expect(await pagina(evento.id, 0)).toMatchObject({ pagina: 1, totalPaginas: 2 });
    expect(await pagina(evento.id, -3)).toMatchObject({ pagina: 1 });
    expect(await pagina(evento.id, Number.NaN)).toMatchObject({ pagina: 1 });
    const alem = await pagina(evento.id, 999);
    expect(alem).toMatchObject({ pagina: 2, totalPaginas: 2 });
    expect(alem.fotos).toHaveLength(2);
  });

  it("evento sem fotos tem uma página vazia", async () => {
    const evento = await novoEvento();
    expect(await pagina(evento.id, 3)).toEqual({ fotos: [], pagina: 1, totalPaginas: 1, total: 0 });
  });

  it("a liberação vale na contagem e nas páginas", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(QUINZE_HORAS);
    const evento = await novoEvento();
    const liberadas = await enviar(evento.id, 50);
    const agendadas = await enviar(evento.id, 30, { modo: "agendada", em: "2026-10-10T16:00" });
    const manuais = await enviar(evento.id, 5, { modo: "manual" });

    const antes = await pagina(evento.id, 2);
    expect(antes).toMatchObject({ pagina: 2, totalPaginas: 2, total: 50 });
    const visiveis = [...(await pagina(evento.id, 1)).fotos, ...antes.fotos].map((f) => f.id);
    expect(visiveis.sort()).toEqual(liberadas.map((f) => f.id).sort());

    // Às 16:00 o lote agendado entra; o manual continua de fora.
    vi.setSystemTime(Date.parse("2026-10-10T19:00:01Z"));
    const depois = await pagina(evento.id, 99);
    expect(depois).toMatchObject({ pagina: 2, totalPaginas: 2, total: 80 });
    const todas = [...(await pagina(evento.id, 1)).fotos, ...depois.fotos].map((f) => f.id);
    expect(todas).toHaveLength(80);
    expect(todas).toEqual(expect.arrayContaining(agendadas.map((f) => f.id)));
    expect(todas.some((id) => manuais.some((m) => m.id === id))).toBe(false);
  });

  it("excluída e não pronta ficam fora da contagem", async () => {
    const evento = await novoEvento();
    const fotos = await enviar(evento.id, 49);
    const banco = await obterBanco();
    await banco.update(t.fotos).set({ excluidaEm: new Date() }).where(eq(t.fotos.id, fotos[0].id));
    await banco.update(t.fotos).set({ status: "processando" }).where(eq(t.fotos.id, fotos[1].id));
    expect(await pagina(evento.id, 1)).toMatchObject({ totalPaginas: 1, total: 47 });
  });

  it("com senha (sem acesso), nenhuma página", async () => {
    const comSenha = await novoEvento({ visibilidade: "senha" });
    await enviar(comSenha.id, 3);
    expect(await pagina(comSenha.id, 1)).toMatchObject({ fotos: [], total: 0 });
  });

  it("aguenta um evento grande (4.000 fotos) com folga", async () => {
    const evento = await novoEvento();
    for (let i = 0; i < 8; i++) await enviar(evento.id, 500);
    const inicio = performance.now();
    const meio = await pagina(evento.id, 40);
    const ms = performance.now() - inicio;
    expect(meio).toMatchObject({ pagina: 40, totalPaginas: 84, total: 4000 });
    expect(meio.fotos).toHaveLength(48);
    // PGlite em memória; no Postgres com o índice de fotos.evento_id é bem menos.
    expect(ms).toBeLessThan(2000);
  });
});
