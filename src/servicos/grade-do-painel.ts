import "server-only";

import { numerosDasFotos, paginaDoPainel } from "@/dados";
import type { FiltroDoPainel } from "@/lib/filtro-painel";
import { estadoDaLiberacao } from "@/lib/liberacao";
import { LEITURA_DE_NUMEROS_DISPONIVEL } from "@/lib/numeros-de-peito";

// A grade do painel para a página e para /api/painel/eventos/[id]/fotos: o mesmo item nos dois.

/** Fotos carregadas de cada vez. */
export const FOTOS_DA_GRADE_POR_VEZ = 24;
/** Teto de uma consulta (a tela atualiza de uma vez o que já mostrou). */
export const FOTOS_DA_GRADE_NO_MAXIMO = 200;

type EventoDaGrade = {
  id: string;
  precoFotoCentavos: number;
  precoVideoCentavos: number;
  lerNumeros?: boolean | null;
};

export async function itensDaGrade(
  evento: EventoDaGrade,
  contaId: string,
  filtro: FiltroDoPainel,
  agora: number,
  { desde = 0, limite = FOTOS_DA_GRADE_POR_VEZ, comNumero = false } = {},
) {
  const linhas = await paginaDoPainel(evento.id, filtro, agora, desde, limite);
  const mostrarNumeros = LEITURA_DE_NUMEROS_DISPONIVEL && (Boolean(evento.lerNumeros) || comNumero);
  const numeros = mostrarNumeros ? await numerosDasFotos(linhas.map((l) => l.id)) : null;
  return linhas.map((i) => ({
    id: i.id,
    urlMiniatura: i.urlMiniatura,
    urlPrevia: i.urlPrevia,
    nomeArquivo: i.nomeArquivo,
    tipo: i.tipo,
    status: i.status,
    erroMensagem: i.erroMensagem,
    vendido: i.vendido,
    precoCentavos: i.precoCentavos,
    precoEventoCentavos: i.tipo === "video" ? evento.precoVideoCentavos : evento.precoFotoCentavos,
    pastaId: i.pastaId,
    estadoLiberacao: estadoDaLiberacao(i.liberarEm, agora),
    liberarEm: i.liberarEm,
    criadoEm: i.criadoEm,
    capturadaEm: i.capturadaEm,
    // "Baixar original" só nas fotos que o dono enviou (não nas dos colaboradores).
    doAutor: i.enviadaPor === contaId,
    numeros: numeros ? (numeros.get(i.id) ?? []) : undefined,
  }));
}
