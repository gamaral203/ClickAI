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
const slugSchema = z
  .string()
  .max(120)
  .regex(/^[a-z0-9-]+$/);
const cidadeSchema = z.string().trim().min(1).max(80);
/** Hora cheia AAAA-MM-DDTHH, como a galeria usa no filtro por horário. */
export const horaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/);

export function lerFiltroEventos(params: Record<string, ValorDeBusca>) {
  const busca = buscaSchema.safeParse(primeiro(params.busca));
  const data = dataSchema.safeParse(primeiro(params.data));
  const categoria = slugSchema.safeParse(primeiro(params.categoria));
  const cidade = cidadeSchema.safeParse(primeiro(params.cidade));
  return {
    busca: busca.success ? busca.data : undefined,
    data: data.success ? data.data : undefined,
    categoria: categoria.success ? categoria.data : undefined,
    cidade: cidade.success ? cidade.data : undefined,
  };
}

/** Filtros da galeria do evento na URL: `?hora=2026-09-27T07` e `?nao-identificadas=1`. */
export function lerFiltroGaleria(params: Record<string, ValorDeBusca>) {
  const hora = horaSchema.safeParse(primeiro(params.hora));
  return {
    hora: hora.success ? hora.data : undefined,
    naoIdentificadas: primeiro(params["nao-identificadas"]) === "1" ? true : undefined,
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
