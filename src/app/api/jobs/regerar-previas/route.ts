import type { NextRequest } from "next/server";
import { z } from "zod";

import { eventoIdPeloSlug } from "@/dados";
import { chamadaDeJobAutorizada } from "@/lib/cron";
import { FOTOS_REGERADAS_POR_VEZ, regerarPrevias } from "@/servicos/regerar-previas";

// Regera prévia e miniatura das fotos com marca d'água de versão anterior
// (src/servicos/regerar-previas.ts). Mesma proteção dos outros jobs (Authorization: Bearer
// CRON_SECRET). Cada chamada processa até `limite` fotos dentro do prazo e responde quantas
// faltam; chame de novo até `restantes` chegar a 0 (docs/arquitetura.md, "Upload").
//
//   GET /api/jobs/regerar-previas?evento=<slug>&limite=600
//
// Sem `evento`, todos os eventos, o mais recente primeiro.

export const maxDuration = 300;

/** Até quando a chamada começa fotos novas: abaixo do maxDuration, com folga para a última. */
const PRAZO_MS = 240 * 1000;

const parametros = z.object({
  evento: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(FOTOS_REGERADAS_POR_VEZ),
});

export async function GET(request: NextRequest) {
  if (!chamadaDeJobAutorizada(request)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const busca = request.nextUrl.searchParams;
  const lidos = parametros.safeParse({
    evento: busca.get("evento") ?? undefined,
    limite: busca.get("limite") ?? undefined,
  });
  if (!lidos.success) {
    return Response.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }
  let eventoId: string | undefined;
  if (lidos.data.evento) {
    eventoId = (await eventoIdPeloSlug(lidos.data.evento)) ?? undefined;
    if (!eventoId) return Response.json({ erro: "Evento não encontrado." }, { status: 404 });
  }
  const resultado = await regerarPrevias({
    eventoId,
    limite: lidos.data.limite,
    prazoMs: PRAZO_MS,
  });
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
