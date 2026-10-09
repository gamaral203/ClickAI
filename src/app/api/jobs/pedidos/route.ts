import type { NextRequest } from "next/server";

import { chamadaDeJobAutorizada } from "@/lib/cron";
import { rodarJobDePedidos } from "@/servicos/jobs";

// Dispara o job de pedidos (expirar e lembrar). Protegido por CRON_SECRET, no formato que o cron
// da Vercel usa (Authorization: Bearer …). Sem CRON_SECRET, só roda em desenvolvimento.

export async function GET(request: NextRequest) {
  if (!chamadaDeJobAutorizada(request)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await rodarJobDePedidos();
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
