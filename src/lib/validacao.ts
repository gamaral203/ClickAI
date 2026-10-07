import { z } from "zod";

// Tudo que vem do navegador (URL, formulários) passa por aqui antes de chegar em src/dados.
// Valor inválido vira "sem filtro" em vez de erro: a pessoa vê a lista completa.

type ValorDeBusca = string | string[] | undefined;

/** Primeiro valor de um parâmetro de busca (?a=1&a=2 vira "1"). */
function primeiro(valor: ValorDeBusca) {
  return Array.isArray(valor) ? valor[0] : valor;
}

const buscaSchema = z.string().trim().min(1).max(100);
const dataSchema = z.iso.date();
const idSchema = z.uuid();

export function lerFiltroEventos(params: Record<string, ValorDeBusca>) {
  const busca = buscaSchema.safeParse(primeiro(params.busca));
  const data = dataSchema.safeParse(primeiro(params.data));
  return {
    busca: busca.success ? busca.data : undefined,
    data: data.success ? data.data : undefined,
  };
}

/** Cursor de paginação: o id de uma foto, ou `null` se ausente ou inválido. */
export function lerCursor(valor: ValorDeBusca) {
  const cursor = idSchema.safeParse(primeiro(valor));
  return cursor.success ? cursor.data : null;
}

export function ehIdValido(valor: string) {
  return idSchema.safeParse(valor).success;
}
