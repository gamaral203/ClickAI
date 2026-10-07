// Tipos do domínio. Espelham as tabelas de docs/arquitetura.md ("Modelo de dados"),
// em camelCase. Dinheiro sempre em centavos (inteiro).

export type StatusEvento = "rascunho" | "publicado" | "arquivado";
export type StatusFoto = "processando" | "pronta" | "erro";

export type Fotografo = {
  id: string;
  nomePublico: string;
  slug: string;
};

export type Evento = {
  id: string;
  fotografoId: string;
  titulo: string;
  slug: string;
  /** Data do evento no formato AAAA-MM-DD. */
  data: string;
  cidade: string;
  precoPadraoCentavos: number;
  status: StatusEvento;
};

export type Foto = {
  id: string;
  eventoId: string;
  /** URL pública da prévia com marca d'água (~1600 px). */
  urlPrevia: string;
  /** URL pública da miniatura (~400 px). */
  urlMiniatura: string;
  largura: number;
  altura: number;
  precoCentavos: number;
  status: StatusFoto;
  criadoEm: string;
  excluidaEm: string | null;
};

/** Evento com os dados que a lista pública precisa. */
export type EventoResumo = Evento & {
  fotografo: Fotografo;
  totalFotos: number;
  capa: Pick<Foto, "urlMiniatura" | "largura" | "altura"> | null;
};

export type PaginaDeFotos = {
  fotos: Foto[];
  /** Passar para a próxima chamada; `null` quando não há mais fotos. */
  proximoCursor: string | null;
};
