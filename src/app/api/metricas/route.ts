import type { NextRequest } from "next/server";
import { z } from "zod";

import { registrarMetrica } from "@/dados";
import { limiteAtingido } from "@/servicos/limites";

// Métricas do painel do fotógrafo (visitas e carrinhos). Não guarda nada de quem visitou:
// nem IP, nem cookie, nem usuário. O limite por IP fica no banco (regra `metricas_ip`, chave
// HMAC, sem o IP), para valer entre todos os servidores sem um mapa crescendo na memória.

const corpo = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("visita_evento"), eventoId: z.uuid() }),
  z.object({ tipo: z.literal("visita_foto"), fotoId: z.uuid() }),
  z.object({ tipo: z.literal("carrinho"), fotoId: z.uuid() }),
]);

export async function POST(request: NextRequest) {
  // Mesmo recusando, responde 204: a métrica nunca atrapalha quem está navegando.
  const texto = await request.text().catch(() => "");
  if (texto.length > 500) return new Response(null, { status: 204 });
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  const dados = corpo.safeParse(json);
  if (!dados.success) return new Response(null, { status: 204 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (await limiteAtingido("metricas_ip", ip)) return new Response(null, { status: 204 });
  await registrarMetrica(dados.data.tipo, dados.data);
  return new Response(null, { status: 204 });
}
