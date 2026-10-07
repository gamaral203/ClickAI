// Métricas, modelos de evento e assinaturas das fotos de exemplo, na memória do servidor
// (Parte A). Na Fase 11 viram as tabelas `metricas`, `modelos_evento` e a coluna
// `fotos.hash_conteudo`.

import type { Metrica, ModeloEvento } from "../tipos";
import { compartilhado } from "./compartilhado";

export const metricas = compartilhado("metricas-exemplo", () => [] as Metrica[]);

export const modelos = compartilhado("modelos-exemplo", () => [] as ModeloEvento[]);

/** SHA-256 do arquivo de cada foto enviada, por evento: acha a mesma foto enviada duas vezes. */
export const hashesPorEvento = compartilhado(
  "hashes-exemplo",
  () => new Map<string, Map<string, string>>(),
);
