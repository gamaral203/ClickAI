import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  atualizarEvento,
  buscarEventoDoFotografo,
  criarEvento,
  listarEventosPublicados,
  mudarStatusDoEvento,
} from "@/dados";
import { categorias, fotografos } from "@/dados/exemplo/dados";
import { formatarPeriodo } from "@/lib/formatar";

const [lia] = fotografos;

const BASE = {
  categoriaId: categorias[0].id,
  local: "Parque Ibirapuera",
  cidade: "São Paulo",
  estado: "SP",
  precoFotoCentavos: 1500,
  precoVideoCentavos: 3000,
  visibilidade: "publico",
  listado: true,
  fotosSoAposBusca: false,
  liberacao: "automatica",
  liberadoEm: null,
  filtroHorario: false,
  listarNaoIdentificadas: false,
  ordenacao: "envio",
} as const;

const slug = () => `data-final-${crypto.randomUUID().slice(0, 8)}`;

async function publicado(dados: { titulo: string; inicioEm: string; fimEm: string | null }) {
  const evento = await criarEvento(lia.id, { ...BASE, ...dados, slug: slug() });
  expect(await mudarStatusDoEvento(evento.id, lia.id, "rascunho", "publicado")).toBe(true);
  return evento;
}

describe("data final opcional do evento", () => {
  it("cria sem data final, lê de volta com null e exibe só o início", async () => {
    const evento = await criarEvento(lia.id, {
      ...BASE,
      titulo: "Sem data final",
      slug: slug(),
      inicioEm: "2027-03-07T08:00:00-03:00",
      fimEm: null,
    });
    expect(evento.fimEm).toBeNull();
    const lido = await buscarEventoDoFotografo(evento.id, lia.id);
    expect(lido!.fimEm).toBeNull();
    expect(formatarPeriodo(lido!.inicioEm, lido!.fimEm)).toBe("7 de março de 2027");
  });

  it("a edição põe e tira a data final", async () => {
    const evento = await criarEvento(lia.id, {
      ...BASE,
      titulo: "Põe e tira",
      slug: slug(),
      inicioEm: "2027-03-07T08:00:00-03:00",
      fimEm: null,
    });
    await atualizarEvento(evento.id, lia.id, { fimEm: "2027-03-09T18:00:00-03:00" });
    const comFim = await buscarEventoDoFotografo(evento.id, lia.id);
    expect(formatarPeriodo(comFim!.inicioEm, comFim!.fimEm)).toBe("7 a 9 de março de 2027");
    await atualizarEvento(evento.id, lia.id, { fimEm: null });
    expect((await buscarEventoDoFotografo(evento.id, lia.id))!.fimEm).toBeNull();
  });

  it("o filtro por dia usa o fim ou, sem ele, o início (COALESCE)", async () => {
    const umDia = await publicado({
      titulo: "Um dia só",
      inicioEm: "2027-04-10T08:00:00-03:00",
      fimEm: null,
    });
    const tresDias = await publicado({
      titulo: "Três dias",
      inicioEm: "2027-04-09T08:00:00-03:00",
      fimEm: "2027-04-11T20:00:00-03:00",
    });
    const ids = async (data: string) =>
      (await listarEventosPublicados({ data, fotografoId: lia.id })).map((e) => e.id);

    expect(await ids("2027-04-10")).toEqual(expect.arrayContaining([umDia.id, tresDias.id]));
    const dia11 = await ids("2027-04-11");
    expect(dia11).toContain(tresDias.id);
    expect(dia11).not.toContain(umDia.id);
    expect(await ids("2027-04-12")).not.toContain(tresDias.id);
  });
});
