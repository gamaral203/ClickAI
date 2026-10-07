"use server";

import { z } from "zod";

import {
  buscarEventoPublicado,
  fotosPorNumero,
  listarFotosDoEvento,
  type Foto,
  type PaginaDeFotos,
} from "@/dados";
import { FOTOS_POR_PAGINA } from "@/lib/galeria";

const entrada = z.object({
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  cursor: z.uuid(),
});

/**
 * Próxima página da galeria. Server Actions são endpoints públicos: valida a entrada e
 * só devolve fotos de evento publicado.
 */
export async function carregarMaisFotos(slug: string, cursor: string): Promise<PaginaDeFotos> {
  const dados = entrada.safeParse({ slug, cursor });
  if (!dados.success) return { fotos: [], proximoCursor: null };

  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return { fotos: [], proximoCursor: null };

  return listarFotosDoEvento(evento.id, { cursor: dados.data.cursor, limite: FOTOS_POR_PAGINA });
}

const numero = z.object({
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  numero: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/),
});

/** Fotos do evento com o número de peito informado. Mesma regra de visibilidade da busca. */
export async function buscarPorNumero(slug: string, numeroDePeito: string): Promise<Foto[]> {
  const dados = numero.safeParse({ slug, numero: numeroDePeito });
  if (!dados.success) return [];
  const evento = await buscarEventoPublicado(dados.data.slug);
  if (!evento) return [];
  return fotosPorNumero(evento.id, dados.data.numero);
}
