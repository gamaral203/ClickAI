import type { NextRequest } from "next/server";

import { chamadaDeJobAutorizada } from "@/lib/cron";
import { rodarJobDeColecoes } from "@/servicos/jobs";

// Dispara o job das coleções: apaga no Rekognition a coleção de rostos dos eventos parados e marca
// no banco que eles precisam ser reindexados se alguém voltar a buscar (src/servicos/colecoes.ts).
// Mesma proteção dos outros jobs (Authorization: Bearer CRON_SECRET), chamado uma vez por dia pelo
// cron da Vercel (vercel.json). Idempotente: rodar de novo não faz mal.

// Cada coleção é uma chamada à AWS; o job para de começar novas depois de 40 s.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!chamadaDeJobAutorizada(request)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await rodarJobDeColecoes();
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
