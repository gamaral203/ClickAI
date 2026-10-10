import { describe, expect, it } from "vitest";

import {
  cidadeDoEndereco,
  enderecoCurto,
  linkComoChegar,
  linkVerNoOpenStreetMap,
  localNoMapaSchema,
  lugarDoNominatim,
  nomeDoLocal,
  pontoDoEvento,
  siglaDaUf,
  ufDoEndereco,
  type ResultadoNominatim,
} from "./mapa";

// Resultados no formato do Nominatim (format=jsonv2, addressdetails=1, accept-language=pt-BR).
const IBIRAPUERA: ResultadoNominatim = {
  osm_type: "way",
  osm_id: 4268245,
  lat: "-23.5874162",
  lon: "-46.6576336",
  category: "leisure",
  name: "Parque Ibirapuera",
  display_name:
    "Parque Ibirapuera, Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo, Região Imediata de São Paulo, Região Metropolitana de São Paulo, Região Geográfica Intermediária de São Paulo, São Paulo, Região Sudeste, 04094-050, Brasil",
  address: {
    leisure: "Parque Ibirapuera",
    road: "Avenida Pedro Álvares Cabral",
    suburb: "Vila Mariana",
    city: "São Paulo",
    municipality: "Região Imediata de São Paulo",
    county: "Região Metropolitana de São Paulo",
    state_district: "Região Geográfica Intermediária de São Paulo",
    state: "São Paulo",
    "ISO3166-2-lvl4": "BR-SP",
    region: "Região Sudeste",
    postcode: "04094-050",
    country: "Brasil",
    country_code: "br",
  },
  boundingbox: ["-23.5944", "-23.5803", "-46.6650", "-46.6501"],
};

// Reverso de um ponto numa rua: o "name" é o da rua.
const FLAMENGO_REVERSO: ResultadoNominatim = {
  osm_type: "way",
  osm_id: 123,
  lat: "-22.9311",
  lon: "-43.1727",
  category: "highway",
  name: "Avenida Infante Dom Henrique",
  display_name: "100, Avenida Infante Dom Henrique, Flamengo, Rio de Janeiro, Brasil",
  address: {
    house_number: "100",
    road: "Avenida Infante Dom Henrique",
    suburb: "Flamengo",
    city: "Rio de Janeiro",
    state: "Rio de Janeiro",
    country_code: "br",
  },
};

describe("validação do ponto no mapa", () => {
  const valido = {
    latitude: "-23.5874",
    longitude: "-46.6576",
    enderecoMapa: "Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo – SP",
  };

  it("aceita coordenadas válidas e converte o texto do formulário em número", () => {
    expect(localNoMapaSchema.parse(valido)).toEqual({
      latitude: -23.5874,
      longitude: -46.6576,
      enderecoMapa: valido.enderecoMapa,
    });
    expect(localNoMapaSchema.parse({ ...valido, latitude: "90", longitude: "-180" })).toMatchObject(
      { latitude: 90, longitude: -180 },
    );
  });

  it("campos vazios ou ausentes são um evento sem mapa", () => {
    const vazio = { latitude: null, longitude: null, enderecoMapa: null };
    expect(localNoMapaSchema.parse({})).toEqual(vazio);
    expect(localNoMapaSchema.parse({ latitude: "", longitude: " ", enderecoMapa: "" })).toEqual(
      vazio,
    );
  });

  it("sem coordenadas, descarta o endereço que sobrou", () => {
    expect(localNoMapaSchema.parse({ latitude: "", longitude: "", enderecoMapa: "Rua" })).toEqual({
      latitude: null,
      longitude: null,
      enderecoMapa: null,
    });
  });

  it("recusa coordenadas fora do intervalo, que não são número ou não são finitas", () => {
    for (const ruim of [
      { latitude: "90.0001" },
      { latitude: "-91" },
      { longitude: "180.5" },
      { longitude: "-181" },
      { latitude: "abc" },
      { latitude: "Infinity" },
      { latitude: "NaN" },
    ]) {
      expect(localNoMapaSchema.safeParse({ ...valido, ...ruim }).success).toBe(false);
    }
  });

  it("recusa latitude sem longitude e vice-versa", () => {
    expect(localNoMapaSchema.safeParse({ ...valido, longitude: "" }).success).toBe(false);
    const r = localNoMapaSchema.safeParse({ ...valido, latitude: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["latitude"]);
  });

  it("limita o endereço do mapa a 500 caracteres", () => {
    expect(localNoMapaSchema.safeParse({ ...valido, enderecoMapa: "x".repeat(500) }).success).toBe(
      true,
    );
    expect(localNoMapaSchema.safeParse({ ...valido, enderecoMapa: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("UF pelo nome do estado", () => {
  it("converte os 27 nomes, com ou sem acento, e aceita a sigla", () => {
    const estados: [string, string][] = [
      ["Acre", "AC"],
      ["Alagoas", "AL"],
      ["Amapá", "AP"],
      ["Amazonas", "AM"],
      ["Bahia", "BA"],
      ["Ceará", "CE"],
      ["Distrito Federal", "DF"],
      ["Espírito Santo", "ES"],
      ["Goiás", "GO"],
      ["Maranhão", "MA"],
      ["Mato Grosso", "MT"],
      ["Mato Grosso do Sul", "MS"],
      ["Minas Gerais", "MG"],
      ["Pará", "PA"],
      ["Paraíba", "PB"],
      ["Paraná", "PR"],
      ["Pernambuco", "PE"],
      ["Piauí", "PI"],
      ["Rio de Janeiro", "RJ"],
      ["Rio Grande do Norte", "RN"],
      ["Rio Grande do Sul", "RS"],
      ["Rondônia", "RO"],
      ["Roraima", "RR"],
      ["Santa Catarina", "SC"],
      ["São Paulo", "SP"],
      ["Sergipe", "SE"],
      ["Tocantins", "TO"],
    ];
    for (const [nome, uf] of estados) expect(siglaDaUf(nome)).toBe(uf);
    expect(siglaDaUf("sao paulo")).toBe("SP");
    expect(siglaDaUf("Estado do Rio Grande do Sul")).toBe("RS");
    expect(siglaDaUf("df")).toBe("DF");
    expect(siglaDaUf("Buenos Aires")).toBeNull();
    expect(siglaDaUf(undefined)).toBeNull();
  });
});

describe("cidade, UF e endereço do Nominatim", () => {
  it("cidade: city, town, village e, por último, municipality", () => {
    expect(cidadeDoEndereco(IBIRAPUERA.address)).toBe("São Paulo");
    expect(cidadeDoEndereco({ town: "Paraty", municipality: "Região Imediata" })).toBe("Paraty");
    expect(cidadeDoEndereco({ village: "Ilha Grande" })).toBe("Ilha Grande");
    expect(cidadeDoEndereco({ municipality: "Brumadinho" })).toBe("Brumadinho");
    expect(cidadeDoEndereco({})).toBeNull();
    expect(cidadeDoEndereco(undefined)).toBeNull();
  });

  it("UF pelo código ISO e, sem ele, pelo nome do estado", () => {
    expect(ufDoEndereco(IBIRAPUERA.address)).toBe("SP");
    expect(ufDoEndereco(FLAMENGO_REVERSO.address)).toBe("RJ");
    expect(ufDoEndereco({ state: "Paraná" })).toBe("PR");
    expect(ufDoEndereco({ "ISO3166-2-lvl4": "AR-B", state: "Buenos Aires" })).toBeNull();
  });

  it("endereço curto: rua, número, bairro, cidade – UF", () => {
    expect(enderecoCurto(IBIRAPUERA)).toBe(
      "Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo – SP",
    );
    expect(enderecoCurto(FLAMENGO_REVERSO)).toBe(
      "Avenida Infante Dom Henrique, 100, Flamengo, Rio de Janeiro – RJ",
    );
    // Sem nada para montar, usa o display_name (cortado em 500).
    expect(enderecoCurto({ display_name: "x".repeat(600), address: {} })).toHaveLength(500);
    // Bairro com o nome da cidade não se repete.
    expect(
      enderecoCurto({ address: { suburb: "Santos", city: "Santos", state: "São Paulo" } }),
    ).toBe("Santos – SP");
  });

  it("o texto do local é o nome do lugar; numa rua, a rua e o número", () => {
    expect(nomeDoLocal(IBIRAPUERA)).toBe("Parque Ibirapuera");
    expect(nomeDoLocal(FLAMENGO_REVERSO)).toBe("Avenida Infante Dom Henrique, 100");
    expect(nomeDoLocal({ address: { road: "Rua Augusta" } })).toBe("Rua Augusta");
    expect(nomeDoLocal({ address: {} })).toBeNull();
    expect(nomeDoLocal({ name: "x".repeat(200) })).toHaveLength(120);
  });

  it("converte o resultado para a tela, com a área para enquadrar", () => {
    expect(lugarDoNominatim(IBIRAPUERA)).toEqual({
      id: "way/4268245",
      latitude: -23.5874162,
      longitude: -46.6576336,
      nome: "Parque Ibirapuera",
      endereco: "Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo – SP",
      cidade: "São Paulo",
      estado: "SP",
      caixa: [-23.5944, -23.5803, -46.665, -46.6501],
    });
    expect(lugarDoNominatim({ ...IBIRAPUERA, lat: "abc" })).toBeNull();
    expect(lugarDoNominatim({ ...IBIRAPUERA, lat: "95" })).toBeNull();
    expect(lugarDoNominatim({ ...IBIRAPUERA, boundingbox: ["1", "2"] })!.caixa).toBeNull();
  });
});

describe("links do mapa", () => {
  const ponto = { latitude: -23.5874, longitude: -46.6576 };

  it("Como chegar abre a rota no Google Maps sem chave; o outro, o OpenStreetMap", () => {
    expect(linkComoChegar(ponto)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-23.5874%2C-46.6576",
    );
    expect(linkVerNoOpenStreetMap(ponto)).toBe(
      "https://www.openstreetmap.org/?mlat=-23.5874&mlon=-46.6576#map=16/-23.5874/-46.6576",
    );
  });

  it("evento sem coordenadas não tem ponto", () => {
    expect(pontoDoEvento({ latitude: null, longitude: null })).toBeNull();
    expect(pontoDoEvento({})).toBeNull();
    expect(pontoDoEvento({ latitude: 1, longitude: 2 })).toEqual({
      latitude: 1,
      longitude: 2,
      enderecoMapa: null,
    });
  });
});
