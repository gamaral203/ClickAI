import "server-only";

import { revisarFotosPresas, type ResultadoFotosPresas } from "./envios";

// Execução por minuto da fila de fotos (/api/jobs/fotos-presas). A fila é o próprio banco: a
// reserva atômica (src/dados/processamento.ts) impede processar em dobro se duas execuções se
// encontrarem, e o que não coube no prazo continua na fila para o minuto seguinte.

/** Até quando uma execução começa fotos novas: termina dentro do minuto, sem se acumular. */
export const PRAZO_DA_FILA_MS = 45 * 1000;

export type ResultadoDaFila = { fotos: ResultadoFotosPresas };

export async function rodarFilaDeFotos(agora = Date.now()): Promise<ResultadoDaFila> {
  return { fotos: await revisarFotosPresas(agora, { prazoMs: PRAZO_DA_FILA_MS }) };
}
