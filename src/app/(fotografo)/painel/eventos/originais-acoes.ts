"use server";

import { ipDaRequisicao } from "@/servicos/limites";
import {
  liberarOriginais,
  loteDeOriginais,
  type ResultadoLote,
} from "@/servicos/originais-do-dono";
import { usuarioAtual } from "@/servicos/sessao";

// Download dos originais pelo dono do evento (src/servicos/originais-do-dono.ts). As duas ações
// leem a sessão e conferem o dono no servidor a cada chamada; nada do que o navegador manda
// (evento, opção, cursor, ids) é aceito sem passar pelo filtro do dono.

/** Libera o download (pede o código da verificação em duas etapas, se ligada). */
export async function liberarOriginaisAcao(eventoId: string, codigo?: string) {
  return liberarOriginais(await usuarioAtual(), eventoId, codigo);
}

/** Próximo lote de até 50 URLs assinadas (~15 min). */
export async function loteDeOriginaisAcao(entrada: unknown): Promise<ResultadoLote> {
  return loteDeOriginais(await usuarioAtual(), entrada, await ipDaRequisicao());
}
