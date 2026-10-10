import { describe, expect, it } from "vitest";

import {
  deGeocoder,
  extrairCidadeEstado,
  linkComoChegar,
  linkVerNoMapa,
  localNoMapaSchema,
  nomeDoLocal,
  pontoDoEvento,
  siglaDaUf,
  type ComponenteEndereco,
} from "./mapa";

// Componentes de endereço do Parque Ibirapuera no formato da Places API (New)
// (Place.addressComponents), em pt-BR.
const IBIRAPUERA: ComponenteEndereco[] = [
  {
    longText: "Avenida Pedro Álvares Cabral",
    shortText: "Av. Pedro Álvares Cabral",
    types: ["route"],
  },
  {
    longText: "Vila Mariana",
    shortText: "Vila Mariana",
    types: ["sublocality_level_1", "sublocality", "political"],
  },
  {
    longText: "São Paulo",
    shortText: "São Paulo",
    types: ["administrative_area_level_2", "political"],
  },
  {
    longText: "São Paulo",
    shortText: "SP",
    types: ["administrative_area_level_1", "political"],
  },
  { longText: "Brasil", shortText: "BR", types: ["country", "political"] },
  { longText: "04094-050", shortText: "04094-050", types: ["postal_code"] },
];

// Componentes no formato do Geocoder (reverse geocoding) de um ponto no Aterro do Flamengo.
const FLAMENGO_GEOCODER = [
  { long_name: "100", short_name: "100", types: ["street_number"] },
  {
    long_name: "Avenida Infante Dom Henrique",
    short_name: "Av. Infante Dom Henrique",
    types: ["route"],
  },
  {
    long_name: "Flamengo",
    short_name: "Flamengo",
    types: ["sublocality_level_1", "sublocality", "political"],
  },
  { long_name: "Rio de Janeiro", short_name: "Rio de Janeiro", types: ["locality", "political"] },
  {
    long_name: "Rio de Janeiro",
    short_name: "RJ",
    types: ["administrative_area_level_1", "political"],
  },
  { long_name: "Brasil", short_name: "BR", types: ["country", "political"] },
];

describe("validação do ponto no mapa", () => {
  const valido = {
    latitude: "-23.5874",
    longitude: "-46.6576",
    placeId: "ChIJ-ZpHqbBZzpQRx3pBdIsbr6w",
    enderecoMapa: "Av. Pedro Álvares Cabral - Vila Mariana, São Paulo - SP, 04094-050, Brasil",
  };

  it("aceita coordenadas válidas e converte o texto do formulário em número", () => {
    expect(localNoMapaSchema.parse(valido)).toEqual({
      latitude: -23.5874,
      longitude: -46.6576,
      placeId: valido.placeId,
      enderecoMapa: valido.enderecoMapa,
    });
    expect(localNoMapaSchema.parse({ ...valido, latitude: "90", longitude: "-180" })).toMatchObject(
      {
        latitude: 90,
        longitude: -180,
      },
    );
  });

  it("campos vazios ou ausentes são um evento sem mapa", () => {
    const vazio = { latitude: null, longitude: null, placeId: null, enderecoMapa: null };
    expect(localNoMapaSchema.parse({})).toEqual(vazio);
    expect(
      localNoMapaSchema.parse({ latitude: "", longitude: " ", placeId: "", enderecoMapa: "" }),
    ).toEqual(vazio);
  });

  it("sem coordenadas, descarta o place_id e o endereço que sobraram", () => {
    expect(
      localNoMapaSchema.parse({ latitude: "", longitude: "", placeId: "abc", enderecoMapa: "Rua" }),
    ).toEqual({ latitude: null, longitude: null, placeId: null, enderecoMapa: null });
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

  it("limita o place_id (255, só caracteres de id) e o endereço (500)", () => {
    expect(localNoMapaSchema.safeParse({ ...valido, placeId: "a".repeat(255) }).success).toBe(true);
    expect(localNoMapaSchema.safeParse({ ...valido, placeId: "a".repeat(256) }).success).toBe(
      false,
    );
    expect(localNoMapaSchema.safeParse({ ...valido, placeId: "abc&x=<script>" }).success).toBe(
      false,
    );
    expect(localNoMapaSchema.safeParse({ ...valido, enderecoMapa: "x".repeat(500) }).success).toBe(
      true,
    );
    expect(localNoMapaSchema.safeParse({ ...valido, enderecoMapa: "x".repeat(501) }).success).toBe(
      false,
    );
  });
});

describe("cidade e estado do endereço do Google", () => {
  it("lê o município do administrative_area_level_2 e a sigla do estado", () => {
    expect(extrairCidadeEstado(IBIRAPUERA)).toEqual({ cidade: "São Paulo", estado: "SP" });
  });

  it("usa a locality quando não há administrative_area_level_2 (resposta do Geocoder)", () => {
    expect(extrairCidadeEstado(deGeocoder(FLAMENGO_GEOCODER))).toEqual({
      cidade: "Rio de Janeiro",
      estado: "RJ",
    });
  });

  it("converte o nome do estado em sigla quando o Google não manda a sigla", () => {
    expect(
      extrairCidadeEstado([
        { longText: "Curitiba", shortText: "Curitiba", types: ["administrative_area_level_2"] },
        {
          longText: "State of Paraná",
          shortText: "State of Paraná",
          types: ["administrative_area_level_1"],
        },
      ]),
    ).toEqual({ cidade: "Curitiba", estado: "PR" });
    expect(siglaDaUf("Estado do Rio Grande do Sul")).toBe("RS");
    expect(siglaDaUf("são paulo")).toBe("SP");
    expect(siglaDaUf("df")).toBe("DF");
    expect(siglaDaUf("Buenos Aires")).toBeNull();
  });

  it("sem componentes, não inventa cidade nem estado", () => {
    expect(extrairCidadeEstado([])).toEqual({ cidade: null, estado: null });
  });

  it("o texto do local é o nome do lugar ou, sem nome, a rua e o número", () => {
    expect(nomeDoLocal(IBIRAPUERA, "Parque Ibirapuera")).toBe("Parque Ibirapuera");
    expect(nomeDoLocal(deGeocoder(FLAMENGO_GEOCODER))).toBe("Avenida Infante Dom Henrique, 100");
    expect(nomeDoLocal(IBIRAPUERA)).toBe("Avenida Pedro Álvares Cabral");
    expect(nomeDoLocal([])).toBeNull();
    expect(nomeDoLocal([], "x".repeat(200))).toHaveLength(120);
  });
});

describe("links do Google Maps", () => {
  const ponto = { latitude: -23.5874, longitude: -46.6576, placeId: "ChIJabc_123-x" };

  it("monta o link de ver no mapa e o de rota, com o place_id quando houver", () => {
    expect(linkVerNoMapa(ponto)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-23.5874%2C-46.6576&query_place_id=ChIJabc_123-x",
    );
    expect(linkComoChegar({ ...ponto, placeId: null })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-23.5874%2C-46.6576",
    );
  });

  it("evento sem coordenadas não tem ponto", () => {
    expect(pontoDoEvento({ latitude: null, longitude: null })).toBeNull();
    expect(pontoDoEvento({})).toBeNull();
    expect(pontoDoEvento({ latitude: 1, longitude: 2 })).toEqual({
      latitude: 1,
      longitude: 2,
      placeId: null,
      enderecoMapa: null,
    });
  });
});
