import { describe, expect, it, vi } from "vitest";

// `connection()` só existe dentro de uma requisição do Next; aqui as funções rodam direto.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

import {
  atualizarEvento,
  buscarEventoDoFotografo,
  buscarEventoPublicado,
  buscarModelo,
  criarEvento,
  salvarModeloDoEvento,
} from "@/dados";
// Os ids vêm dos dados de exemplo: são os mesmos que a semente grava no banco (PGlite).
import { categorias, fotografos } from "@/dados/exemplo/dados";

const [lia, pedro] = fotografos;

const BASE = {
  categoriaId: categorias[0].id,
  inicioEm: "2026-11-01T08:00:00-03:00",
  fimEm: "2026-11-01T12:00:00-03:00",
  local: "Parque Ibirapuera, portão 3",
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

const PONTO = {
  latitude: -23.5874,
  longitude: -46.6576,
  enderecoMapa: "Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo – SP",
};

function slug() {
  return `evento-mapa-${crypto.randomUUID().slice(0, 8)}`;
}

describe("local do evento no mapa", () => {
  it("grava e devolve as coordenadas e o endereço do mapa", async () => {
    const evento = await criarEvento(lia.id, {
      ...BASE,
      ...PONTO,
      titulo: "Evento com mapa",
      slug: slug(),
    });
    expect(evento).toMatchObject(PONTO);
    const lido = await buscarEventoDoFotografo(evento.id, lia.id);
    expect(lido).toMatchObject(PONTO);
    // A precisão do double precision é mantida.
    expect(lido!.latitude).toBe(-23.5874);
    // place_id (resíduo do Google Maps) continua no banco, mas fora do schema: não aparece.
    expect(lido).not.toHaveProperty("placeId");
  });

  it("evento sem mapa fica com tudo nulo; o Remover limpa o ponto sem mexer no local", async () => {
    const semMapa = await criarEvento(lia.id, { ...BASE, titulo: "Sem mapa", slug: slug() });
    expect(semMapa).toMatchObject({
      latitude: null,
      longitude: null,
      enderecoMapa: null,
    });

    const comMapa = await criarEvento(lia.id, {
      ...BASE,
      ...PONTO,
      titulo: "Com mapa",
      slug: slug(),
    });
    const removido = await atualizarEvento(comMapa.id, lia.id, {
      latitude: null,
      longitude: null,
      enderecoMapa: null,
    });
    expect(removido).toMatchObject({ latitude: null, longitude: null, local: BASE.local });
  });

  it("só o dono muda o ponto do evento", async () => {
    const evento = await criarEvento(lia.id, { ...BASE, ...PONTO, titulo: "Da Lia", slug: slug() });
    expect(await atualizarEvento(evento.id, pedro.id, { latitude: 0, longitude: 0 })).toBeNull();
    expect(await buscarEventoDoFotografo(evento.id, lia.id)).toMatchObject(PONTO);
  });

  it("a página pública recebe o ponto do evento de exemplo do Ibirapuera", async () => {
    const evento = await buscarEventoPublicado("corrida-ibirapuera-10k-2026");
    expect(evento).toMatchObject({ latitude: -23.5874, longitude: -46.6576 });
    expect(evento!.enderecoMapa).toBe("Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo – SP");
  });

  it("o modelo do evento guarda o ponto do mapa junto com o local", async () => {
    const evento = await criarEvento(lia.id, { ...BASE, ...PONTO, titulo: "Modelo", slug: slug() });
    const modelo = await salvarModeloDoEvento(evento.id, lia.id, "Ibirapuera");
    expect(modelo).not.toBeNull();
    expect((await buscarModelo(modelo!.id, lia.id))!.config).toMatchObject({
      local: BASE.local,
      ...PONTO,
    });
  });
});
