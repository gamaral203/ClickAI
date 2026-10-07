import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { rodarJobDePedidos } from "@/servicos/jobs";

// Dispara o job de pedidos (expirar e lembrar). Protegido por CRON_SECRET, no formato que o cron
// da Vercel usa (Authorization: Bearer …). Sem CRON_SECRET, só roda em desenvolvimento.

function autorizado(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const resultado = await rodarJobDePedidos();
  return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
