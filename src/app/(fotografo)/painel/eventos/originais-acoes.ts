"use server";

import { ipDaRequisicao } from "@/servicos/limites";
import {
  liberarOriginais,
  liberarOriginaisDoAutor,
  loteDeOriginais,
  type ResultadoLote,
} from "@/servicos/originais-do-dono";
import { usuarioAtual } from "@/servicos/sessao";

// Download dos originais pelo autor (src/servicos/originais-do-dono.ts). As ações leem a sessão
// e conferem no servidor a cada chamada; nada do que o navegador manda (evento, opção, cursor,
// ids) é aceito sem passar pelo filtro do dono e do autor.

/** Libera o download em lote do dono (pede o código da verificação em duas etapas, se ligada). */
export async function liberarOriginaisAcao(eventoId: string, codigo?: string) {
  return liberarOriginais(await usuarioAtual(), eventoId, codigo);
}

/** Próximo lote de até 50 URLs assinadas (~15 min). */
export async function loteDeOriginaisAcao(entrada: unknown): Promise<ResultadoLote> {
  return loteDeOriginais(await usuarioAtual(), entrada, await ipDaRequisicao());
}

/**
 * Libera o "Baixar original" das fotos que o usuário enviou ao evento (dono ou colaborador). A
 * foto em si é conferida de novo na rota /api/painel/original/[fotoId].
 */
export async function liberarOriginalDoAutorAcao(eventoId: string, codigo?: string) {
  return liberarOriginaisDoAutor(await usuarioAtual(), eventoId, codigo);
}
