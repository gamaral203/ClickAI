import { describe, expect, it, vi } from "vitest";

import { clienteNominatim, NominatimIndisponivel, USER_AGENT } from "./nominatim";

const PARQUE = {
  osm_type: "way",
  osm_id: 1,
  lat: "-23.5874",
  lon: "-46.6576",
  category: "leisure",
  name: "Parque Ibirapuera",
  address: { road: "Avenida Pedro Álvares Cabral", city: "São Paulo", state: "São Paulo" },
};

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("cliente do Nominatim", () => {
  it("busca no Brasil, em pt-BR, com até 6 resultados e se identifica pelo User-Agent", async () => {
    const buscar = vi.fn<typeof fetch>(async () => respostaJson([PARQUE]));
    const cliente = clienteNominatim({ fetch: buscar, intervaloMs: 0 });
    const lugares = await cliente.buscarLugares("  Parque   Ibirapuera ");
    expect(lugares).toHaveLength(1);
    expect(lugares[0]).toMatchObject({
      nome: "Parque Ibirapuera",
      cidade: "São Paulo",
      estado: "SP",
    });

    const [url, init] = buscar.mock.calls[0];
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      format: "jsonv2",
      addressdetails: "1",
      "accept-language": "pt-BR",
      q: "Parque Ibirapuera",
      countrycodes: "br",
      limit: "6",
    });
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("guarda a resposta por 10 minutos: a mesma busca não sai de novo", async () => {
    let agora = 0;
    const buscar = vi.fn(async () => respostaJson([PARQUE]));
    const cliente = clienteNominatim({ fetch: buscar, intervaloMs: 0, agora: () => agora });
    await cliente.buscarLugares("Parque Ibirapuera");
    agora = 9 * 60 * 1000;
    await cliente.buscarLugares("Parque Ibirapuera");
    expect(buscar).toHaveBeenCalledTimes(1);
    agora = 11 * 60 * 1000;
    await cliente.buscarLugares("Parque Ibirapuera");
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("espera o intervalo entre duas requisições (1 por segundo no site real)", async () => {
    const momentos: number[] = [];
    const buscar = vi.fn(async () => {
      momentos.push(performance.now());
      return respostaJson([]);
    });
    const cliente = clienteNominatim({ fetch: buscar, intervaloMs: 120 });
    await Promise.all([
      cliente.buscarLugares("um lugar"),
      cliente.buscarLugares("outro lugar"),
      cliente.buscarLugares("mais um lugar"),
    ]);
    expect(buscar).toHaveBeenCalledTimes(3);
    expect(momentos[1] - momentos[0]).toBeGreaterThanOrEqual(110);
    expect(momentos[2] - momentos[1]).toBeGreaterThanOrEqual(110);
  });

  it("recusa na hora quando a fila está cheia, em vez de segurar a pessoa", async () => {
    const buscar = vi.fn(async () => respostaJson([]));
    const cliente = clienteNominatim({ fetch: buscar, intervaloMs: 50, filaMaxima: 1 });
    const primeira = cliente.buscarLugares("primeira");
    await expect(cliente.buscarLugares("segunda")).rejects.toBeInstanceOf(NominatimIndisponivel);
    await primeira;
  });

  it("erro HTTP, rede fora ou resposta inválida viram NominatimIndisponivel", async () => {
    const limite = clienteNominatim({
      fetch: async () => respostaJson({ error: "limite" }, 429),
      intervaloMs: 0,
    });
    await expect(limite.buscarLugares("qualquer")).rejects.toBeInstanceOf(NominatimIndisponivel);
    const semRede = clienteNominatim({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      intervaloMs: 0,
    });
    await expect(semRede.buscarLugares("qualquer")).rejects.toBeInstanceOf(NominatimIndisponivel);
    const invalida = clienteNominatim({
      fetch: async () => new Response("<html>", { status: 200 }),
      intervaloMs: 0,
    });
    await expect(invalida.buscarLugares("qualquer")).rejects.toBeInstanceOf(NominatimIndisponivel);
  });

  it("reverso: endereço do ponto marcado, com as coordenadas do próprio ponto", async () => {
    const buscar = vi.fn<typeof fetch>(async () =>
      respostaJson({
        ...PARQUE,
        lat: "-23.58",
        lon: "-46.65",
        category: "highway",
        name: "Rua X",
        address: { road: "Rua X", house_number: "10", city: "São Paulo", state: "São Paulo" },
      }),
    );
    const cliente = clienteNominatim({ fetch: buscar, intervaloMs: 0 });
    const lugar = await cliente.lugarNoPonto(-23.587412345, -46.657698765);
    expect(lugar).toMatchObject({
      latitude: -23.587412345,
      longitude: -46.657698765,
      nome: "Rua X, 10",
      endereco: "Rua X, 10, São Paulo – SP",
    });
    const u = new URL(String(buscar.mock.calls[0][0]));
    expect(u.pathname).toBe("/reverse");
    expect(u.searchParams.get("lat")).toBe("-23.587412");
    expect(u.searchParams.get("lon")).toBe("-46.657699");
  });

  it("reverso sem nada no ponto (mar) devolve null", async () => {
    const cliente = clienteNominatim({
      fetch: async () => respostaJson({ error: "Unable to geocode" }),
      intervaloMs: 0,
    });
    expect(await cliente.lugarNoPonto(-25, -40)).toBeNull();
  });
});
