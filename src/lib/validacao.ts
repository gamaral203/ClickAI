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

/** Filtros da galeria na URL: `?hora=2026-09-27T07`, `?nao-identificadas=1` e `?pasta=<id>`. */
export function lerFiltroGaleria(params: Record<string, ValorDeBusca>) {
  const hora = horaSchema.safeParse(primeiro(params.hora));
  const pasta = idSchema.safeParse(primeiro(params.pasta));
  return {
    hora: hora.success ? hora.data : undefined,
    pasta: pasta.success ? pasta.data : undefined,
    naoIdentificadas: primeiro(params["nao-identificadas"]) === "1" ? true : undefined,
    tipo:
      primeiro(params.tipo) === "video"
        ? ("video" as const)
        : primeiro(params.tipo) === "foto"
          ? ("foto" as const)
          : undefined,
  };
}

const paginaSchema = z
  .string()
  .regex(/^\d{1,6}$/)
  .transform(Number)
  .pipe(z.int().min(1));

/**
 * Página da galeria (`?pagina=6`). Ausente ou inválida vira 1; acima da última, o servidor leva
 * para a última (ele é quem sabe quantas há).
 */
export function lerPagina(valor: ValorDeBusca) {
  const pagina = paginaSchema.safeParse(primeiro(valor));
  return pagina.success ? pagina.data : 1;
}

export function ehIdValido(valor: string) {
  return idSchema.safeParse(valor).success;
}
