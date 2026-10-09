import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Chamada de job autorizada: `Authorization: Bearer <CRON_SECRET>`, no formato do cron da Vercel
 * e do GitHub Actions (.github/workflows/jobs.yml), comparado em tempo constante. Sem
 * CRON_SECRET, só em desenvolvimento.
 */
export function chamadaDeJobAutorizada(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
