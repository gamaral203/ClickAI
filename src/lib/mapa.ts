// Local do evento no Google Maps (docs/arquitetura.md, "Local no mapa"). Funções puras: a
// validação do ponto que chega do formulário (o servidor confere tudo de novo), a leitura de
// cidade e estado dos componentes de endereço do Google e os links para o Google Maps.
// O carregamento do Maps no navegador fica em src/lib/google-maps.ts.

import { z } from "zod";

import { UFS } from "@/lib/ufs";

export type Uf = (typeof UFS)[number];

/** Ponto escolhido no mapa, como fica gravado no evento. */
export type PontoNoMapa = {
  latitude: number;
  longitude: number;
  placeId: string | null;
  enderecoMapa: string | null;
};

/** O que o navegador precisa para abrir o Google Maps (só existe com a chave configurada). */
export type ConfigMapa = {
  /** Chave pública do Maps JS, restrita por referenciador ao domínio do site. */
  chave: string;
  /** Nonce da CSP desta requisição, passado ao script do Google. */
  nonce: string | null;
  /** Map ID do Google Cloud (marcador avançado); sem ele, o de demonstração. */
  idDoMapa: string;
};

/** Brasil inteiro, quando ainda não há ponto nem cidade para centralizar. */
export const CENTRO_DO_BRASIL = { lat: -14.235, lng: -51.9253, zoom: 4 } as const;

export const LIMITES_MAPA = { placeId: 255, enderecoMapa: 500 } as const;

export const MENSAGEM_MAPA_INVALIDO =
  "Não foi possível usar o ponto escolhido no mapa. Escolha o local de novo.";

/** Campos ocultos do formulário do evento que guardam o ponto do mapa. */
export const CAMPOS_DO_MAPA = ["latitude", "longitude", "placeId", "enderecoMapa"] as const;

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

const textoOpcional = (max: number, formato?: RegExp) =>
  z.preprocess(
    (v) => {
      const valor = vazioViraNulo(v);
      return typeof valor === "string" ? valor.trim() : valor;
    },
    (formato
      ? z
          .string(MENSAGEM_MAPA_INVALIDO)
          .max(max, MENSAGEM_MAPA_INVALIDO)
          .regex(formato, MENSAGEM_MAPA_INVALIDO)
      : z.string(MENSAGEM_MAPA_INVALIDO).max(max, MENSAGEM_MAPA_INVALIDO)
    ).nullable(),
  );

/**
 * Campos do ponto no mapa, como chegam do formulário (texto; vazio é "sem mapa"). Para juntar ao
 * schema do evento; a regra "latitude e longitude juntas" fica em `mapaCompleto`.
 */
export const camposDoMapa = {
  latitude: coordenada(-90, 90),
  longitude: coordenada(-180, 180),
  // Place ID do Google: letras, números, "_" e "-".
  placeId: textoOpcional(LIMITES_MAPA.placeId, /^[A-Za-z0-9_-]+$/),
  enderecoMapa: textoOpcional(LIMITES_MAPA.enderecoMapa),
};

type CamposDoMapa = {
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  enderecoMapa: string | null;
};

/** Latitude e longitude vêm as duas ou nenhuma. */
export function mapaCompleto(d: Pick<CamposDoMapa, "latitude" | "longitude">) {
  return (d.latitude === null) === (d.longitude === null);
}

/** Sem coordenadas, o place_id e o endereço do mapa também somem. */
export function normalizarMapa(d: CamposDoMapa): CamposDoMapa {
  if (d.latitude === null || d.longitude === null) {
    return { latitude: null, longitude: null, placeId: null, enderecoMapa: null };
  }
  return {
    latitude: d.latitude,
    longitude: d.longitude,
    placeId: d.placeId,
    enderecoMapa: d.enderecoMapa,
  };
}

/** Schema só do ponto no mapa (o do evento junta `camposDoMapa` aos outros campos). */
export const localNoMapaSchema = z
  .object(camposDoMapa)
  .refine(mapaCompleto, { path: ["latitude"], message: MENSAGEM_MAPA_INVALIDO })
  .transform(normalizarMapa);

// ---------------------------------------------------------------- Endereço do Google

/** Componente de endereço no formato da Places API (New): `longText`, `shortText`, `types`. */
export type ComponenteEndereco = {
  longText: string | null;
  shortText: string | null;
  types: string[];
};

/** Componente no formato do Geocoder do Maps JS (`long_name`, `short_name`). */
export type ComponenteGeocoder = { long_name: string; short_name: string; types: string[] };

export function deGeocoder(componentes: ComponenteGeocoder[]): ComponenteEndereco[] {
  return componentes.map((c) => ({
    longText: c.long_name,
    shortText: c.short_name,
    types: c.types,
  }));
}

const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

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

/** Sigla da UF a partir da sigla ou do nome ("SP", "São Paulo", "State of São Paulo"). */
export function siglaDaUf(texto: string | null | undefined): Uf | null {
  if (!texto) return null;
  const maiusculo = texto.trim().toUpperCase();
  if ((UFS as readonly string[]).includes(maiusculo)) return maiusculo as Uf;
  const nome = semAcento(texto).replace(/^(state of|estado d[eoa])\s+/, "");
  return UF_POR_NOME[nome] ?? null;
}

function componente(componentes: ComponenteEndereco[], tipo: string) {
  return componentes.find((c) => c.types.includes(tipo));
}

/**
 * Cidade e UF do endereço do Google. No Brasil, o município vem em
 * `administrative_area_level_2` (às vezes só em `locality`) e o estado em
 * `administrative_area_level_1`, com a sigla no texto curto.
 */
export function extrairCidadeEstado(componentes: ComponenteEndereco[]): {
  cidade: string | null;
  estado: Uf | null;
} {
  const municipio =
    componente(componentes, "administrative_area_level_2") ?? componente(componentes, "locality");
  const uf = componente(componentes, "administrative_area_level_1");
  return {
    cidade: municipio?.longText?.trim() || municipio?.shortText?.trim() || null,
    estado: siglaDaUf(uf?.shortText) ?? siglaDaUf(uf?.longText),
  };
}

/**
 * Texto do campo "Local": o nome do lugar (parque, ginásio) ou, sem nome, a rua e o número.
 * Corta em 120 caracteres, o limite do campo.
 */
export function nomeDoLocal(
  componentes: ComponenteEndereco[],
  nome?: string | null,
): string | null {
  const rua = componente(componentes, "route")?.longText?.trim();
  const numero = componente(componentes, "street_number")?.longText?.trim();
  const endereco = rua ? (numero ? `${rua}, ${numero}` : rua) : null;
  const escolhido = nome?.trim() || endereco;
  return escolhido ? escolhido.slice(0, 120) : null;
}

// ---------------------------------------------------------------- Links

type Destino = { latitude: number; longitude: number; placeId?: string | null };

/** Abre o lugar no Google Maps (site ou app). Sem chave: é só um link. */
export function linkVerNoMapa({ latitude, longitude, placeId }: Destino) {
  const parametros = new URLSearchParams({ api: "1", query: `${latitude},${longitude}` });
  if (placeId) parametros.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${parametros}`;
}

/** Rota até o lugar no Google Maps, a partir de onde a pessoa estiver. */
export function linkComoChegar({ latitude, longitude, placeId }: Destino) {
  const parametros = new URLSearchParams({ api: "1", destination: `${latitude},${longitude}` });
  if (placeId) parametros.set("destination_place_id", placeId);
  return `https://www.google.com/maps/dir/?${parametros}`;
}

/** Ponto gravado no evento, ou `null` se o evento não tem mapa. */
export function pontoDoEvento(evento: {
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  enderecoMapa?: string | null;
}): PontoNoMapa | null {
  if (evento.latitude == null || evento.longitude == null) return null;
  return {
    latitude: evento.latitude,
    longitude: evento.longitude,
    placeId: evento.placeId ?? null,
    enderecoMapa: evento.enderecoMapa ?? null,
  };
}

/** "-23.58740, -46.65760", para quando o Google não devolve endereço. */
export function coordenadasEmTexto({
  latitude,
  longitude,
}: Pick<Destino, "latitude" | "longitude">) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
