import type { NextRequest } from "next/server";

import { chamadaDeJobAutorizada } from "@/lib/cron";
import { rodarJobDeRevisao } from "@/servicos/jobs";

// Dispara o job de revisão: confere os saques em processamento no Mercado Pago e revisa as fotos
// presas em `processando` (src/servicos/jobs.ts). Mesma proteção do job de pedidos
// (Authorization: Bearer CRON_SECRET), chamado pelo GitHub Actions a cada 10 minutos.

// Cada foto presa pode levar alguns segundos (baixar, gerar prévias, cadastrar rostos).
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!chamadaDeJobAutorizada(request)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await rodarJobDeRevisao();
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
