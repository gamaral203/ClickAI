"use server";

import { ipDaRequisicao } from "@/servicos/limites";
import {
  liberarOriginaisDaGestao,
  loteDeOriginaisDaGestao,
  type ResultadoLoteDaGestao,
} from "@/servicos/originais-da-gestao";
import { usuarioAtual } from "@/servicos/sessao";

// Download dos originais pela gestão (src/servicos/originais-da-gestao.ts). As ações leem a
// sessão e o serviço confere o papel de gestor a cada chamada; nada do que o navegador manda
// (evento, filtro, cursor, ids) é aceito sem passar pelo Zod e pelas consultas.

/** Libera o download pela gestão por 3 horas (código do e-mail, se o MFA estiver ligado). */
export async function liberarOriginaisDaGestaoAcao(codigo?: string) {
  return liberarOriginaisDaGestao(await usuarioAtual(), codigo);
}

/** Próximo lote de até 50 URLs assinadas (~15 min) de um evento. */
export async function loteDeOriginaisDaGestaoAcao(
  entrada: unknown,
): Promise<ResultadoLoteDaGestao> {
  return loteDeOriginaisDaGestao(await usuarioAtual(), entrada, await ipDaRequisicao());
}
