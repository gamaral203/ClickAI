"use server";

import { z } from "zod";

import { buscarEventoPublicado, listarFotosDoEvento, type PaginaDeFotos } from "@/dados";
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
