// Local do evento no mapa (docs/arquitetura.md, "Local no mapa"), com OpenStreetMap: tiles do
// OSM no navegador (Leaflet) e endereços do Nominatim, consultado só pelo servidor
// (src/servicos/nominatim.ts). Funções puras: a validação do ponto que chega do formulário (o
// servidor confere tudo de novo), a leitura de cidade, UF e endereço curto da resposta do
// Nominatim e os links para abrir o lugar fora do site.

import { z } from "zod";

import { UFS } from "@/lib/ufs";

export type Uf = (typeof UFS)[number];

/** Ponto escolhido no mapa, como fica gravado no evento. */
export type PontoNoMapa = {
  latitude: number;
  longitude: number;
  enderecoMapa: string | null;
};

/** Brasil inteiro, quando ainda não há ponto nem cidade para centralizar. */
export const CENTRO_DO_BRASIL = { lat: -14.235, lng: -51.9253, zoom: 4 } as const;

export const LIMITES_MAPA = { enderecoMapa: 500, consulta: 200 } as const;

export const MENSAGEM_MAPA_INVALIDO =
  "Não foi possível usar o ponto escolhido no mapa. Escolha o local de novo.";

export const MENSAGEM_BUSCA_INDISPONIVEL =
  "Não foi possível buscar o endereço agora; você pode marcar o ponto no mapa ou escrever o local.";

/** Campos ocultos do formulário do evento que guardam o ponto do mapa. */
export const CAMPOS_DO_MAPA = ["latitude", "longitude", "enderecoMapa"] as const;

const vazioViraNulo = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const coordenada = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      const valor = vazioViraNulo(v);
      return typeof valor === "string" ? Number(valor.trim()) : valor;
    },
    // z.number() já recusa NaN e infinito.
    z
      .number(MENSAGEM_MAPA_INVALIDO)
      .min(min, MENSAGEM_MAPA_INVALIDO)
      .max(max, MENSAGEM_MAPA_INVALIDO)
      .nullable(),
  );

/**
 * Campos do ponto no mapa, como chegam do formulário (texto; vazio é "sem mapa"). Para juntar ao
 * schema do evento; a regra "latitude e longitude juntas" fica em `mapaCompleto`.
 */
export const camposDoMapa = {
  latitude: coordenada(-90, 90),
  longitude: coordenada(-180, 180),
  enderecoMapa: z.preprocess((v) => {
    const valor = vazioViraNulo(v);
    return typeof valor === "string" ? valor.trim() : valor;
  }, z.string(MENSAGEM_MAPA_INVALIDO).max(LIMITES_MAPA.enderecoMapa, MENSAGEM_MAPA_INVALIDO).nullable()),
};

type CamposDoMapa = {
  latitude: number | null;
  longitude: number | null;
  enderecoMapa: string | null;
};

/** Latitude e longitude vêm as duas ou nenhuma. */
export function mapaCompleto(d: Pick<CamposDoMapa, "latitude" | "longitude">) {
  return (d.latitude === null) === (d.longitude === null);
}

/** Sem coordenadas, o endereço do mapa também some. */
export function normalizarMapa(d: CamposDoMapa): CamposDoMapa {
  if (d.latitude === null || d.longitude === null) {
    return { latitude: null, longitude: null, enderecoMapa: null };
  }
  return { latitude: d.latitude, longitude: d.longitude, enderecoMapa: d.enderecoMapa };
}

/** Schema só do ponto no mapa (o do evento junta `camposDoMapa` aos outros campos). */
export const localNoMapaSchema = z
  .object(camposDoMapa)
  .refine(mapaCompleto, { path: ["latitude"], message: MENSAGEM_MAPA_INVALIDO })
  .transform(normalizarMapa);

// ---------------------------------------------------------------- Resposta do Nominatim

/** `address` do Nominatim (`addressdetails=1`): só texto, com chaves que variam por lugar. */
export type EnderecoNominatim = Record<string, string | undefined>;

/** Um resultado do Nominatim em `format=jsonv2` (busca ou reverso). */
export type ResultadoNominatim = {
  lat: string;
  lon: string;
  name?: string | null;
  display_name?: string;
  /** Tipo do objeto no OSM ("highway" para ruas, "leisure" para parques...). */
  category?: string;
  osm_type?: string;
  osm_id?: number;
  address?: EnderecoNominatim;
  /** [sul, norte, oeste, leste], em texto. */
  boundingbox?: string[];
};

/** Lugar pronto para a tela: coordenadas, textos do formulário e a área para enquadrar. */
export type LugarNoMapa = {
  /** Identificador estável na lista ("way/123"), para a chave do React. */
  id: string;
  latitude: number;
  longitude: number;
  /** Nome do lugar ou rua e número: vai para o campo "Local". */
  nome: string | null;
  /** Endereço curto: vai para `eventos.endereco_mapa`. */
  endereco: string;
  cidade: string | null;
  estado: Uf | null;
  /** [sul, norte, oeste, leste] para enquadrar o mapa no lugar. */
  caixa: [number, number, number, number] | null;
};

const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Os 27 estados (e o DF) pelo nome, sem acento e em minúsculas. */
const UF_POR_NOME: Record<string, Uf> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

/** Sigla da UF a partir da sigla ou do nome ("SP", "São Paulo", "Estado de São Paulo"). */
export function siglaDaUf(texto: string | null | undefined): Uf | null {
  if (!texto) return null;
  const maiusculo = texto.trim().toUpperCase();
  if ((UFS as readonly string[]).includes(maiusculo)) return maiusculo as Uf;
  const nome = semAcento(texto).replace(/^(state of|estado d[eoa])\s+/, "");
  return UF_POR_NOME[nome] ?? null;
}

/**
 * Cidade do endereço do Nominatim. No Brasil, `municipality` costuma ser a "Região Imediata"
 * do IBGE, não o município: por isso fica por último.
 */
export function cidadeDoEndereco(endereco: EnderecoNominatim | undefined): string | null {
  if (!endereco) return null;
  const cidade =
    endereco.city || endereco.town || endereco.village || endereco.municipality || null;
  return cidade?.trim() || null;
}

/** UF do endereço: pelo código ISO ("BR-SP"), senão pelo nome do estado. */
export function ufDoEndereco(endereco: EnderecoNominatim | undefined): Uf | null {
  if (!endereco) return null;
  const iso = endereco["ISO3166-2-lvl4"]?.match(/^BR-([A-Z]{2})$/)?.[1];
  return siglaDaUf(iso) ?? siglaDaUf(endereco.state);
}

const ruaENumero = (e: EnderecoNominatim) => {
  const rua = (e.road || e.pedestrian || e.footway)?.trim();
  if (!rua) return null;
  const numero = e.house_number?.trim();
  return numero ? `${rua}, ${numero}` : rua;
};

/**
 * Endereço curto: "rua, número, bairro, cidade – UF". O `display_name` do Nominatim traz até
 * regiões do IBGE e o país; se não der para montar o curto, usa ele mesmo (cortado em 500).
 */
export function enderecoCurto(resultado: Pick<ResultadoNominatim, "address" | "display_name">) {
  const e = resultado.address ?? {};
  const cidade = cidadeDoEndereco(e);
  const uf = ufDoEndereco(e);
  const bairro = (e.suburb || e.neighbourhood || e.quarter || e.city_district)?.trim();
  const partes = [ruaENumero(e), bairro, cidade].filter((p): p is string => Boolean(p));
  // Evita "São Paulo, São Paulo" quando o bairro tem o nome da cidade.
  const unicas = partes.filter((p, i) => partes.indexOf(p) === i);
  if (unicas.length === 0) {
    return (resultado.display_name ?? "").trim().slice(0, LIMITES_MAPA.enderecoMapa);
  }
  const texto = unicas.join(", ") + (uf ? ` – ${uf}` : "");
  return texto.slice(0, LIMITES_MAPA.enderecoMapa);
}

/**
 * Texto do campo "Local": o nome do lugar (parque, ginásio) ou, sem nome, a rua e o número.
 * Corta em 120 caracteres, o limite do campo.
 */
export function nomeDoLocal(resultado: Pick<ResultadoNominatim, "name" | "address" | "category">) {
  const rua = ruaENumero(resultado.address ?? {});
  // Numa rua, o "nome" do OSM é o da rua: rua e número dizem mais.
  const escolhido =
    resultado.category === "highway"
      ? rua || resultado.name?.trim()
      : resultado.name?.trim() || rua;
  return escolhido ? escolhido.slice(0, 120) : null;
}

/** Converte um resultado do Nominatim; `null` se as coordenadas não forem válidas. */
export function lugarDoNominatim(r: ResultadoNominatim): LugarNoMapa | null {
  const latitude = Number(r.lat);
  const longitude = Number(r.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const caixa = r.boundingbox?.map(Number);
  return {
    id: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : `${latitude},${longitude}`,
    latitude,
    longitude,
    nome: nomeDoLocal(r),
    endereco: enderecoCurto(r),
    cidade: cidadeDoEndereco(r.address),
    estado: ufDoEndereco(r.address),
    caixa:
      caixa?.length === 4 && caixa.every(Number.isFinite)
        ? (caixa as [number, number, number, number])
        : null,
  };
}

// ---------------------------------------------------------------- Links

type Destino = { latitude: number; longitude: number };

/** Rota até o lugar no Google Maps (abre o app no celular). É só um link: não usa chave. */
export function linkComoChegar({ latitude, longitude }: Destino) {
  const parametros = new URLSearchParams({ api: "1", destination: `${latitude},${longitude}` });
  return `https://www.google.com/maps/dir/?${parametros}`;
}

/** O ponto no site do OpenStreetMap. */
export function linkVerNoOpenStreetMap({ latitude, longitude }: Destino) {
  const parametros = new URLSearchParams({ mlat: String(latitude), mlon: String(longitude) });
  return `https://www.openstreetmap.org/?${parametros}#map=16/${latitude}/${longitude}`;
}

/** Ponto gravado no evento, ou `null` se o evento não tem mapa. */
export function pontoDoEvento(evento: {
  latitude?: number | null;
  longitude?: number | null;
  enderecoMapa?: string | null;
}): PontoNoMapa | null {
  if (evento.latitude == null || evento.longitude == null) return null;
  return {
    latitude: evento.latitude,
    longitude: evento.longitude,
    enderecoMapa: evento.enderecoMapa ?? null,
  };
}

/** "-23.58740, -46.65760", para quando não há endereço. */
export function coordenadasEmTexto({ latitude, longitude }: Destino) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
