import type { NextRequest } from "next/server";
import { z } from "zod";

import { registrarMetrica } from "@/dados";

// Métricas do painel do fotógrafo (visitas e carrinhos). Não guarda nada de quem visitou:
// nem IP, nem cookie, nem usuário. O IP só serve, na memória, para limitar abusos.

const LIMITE_POR_MINUTO = 120;
const recentes = new Map<string, number[]>();

function limiteAtingido(ip: string) {
  const agora = Date.now();
  const janela = (recentes.get(ip) ?? []).filter((t) => agora - t < 60_000);
  janela.push(agora);
  recentes.set(ip, janela);
  return janela.length > LIMITE_POR_MINUTO;
}

const corpo = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("visita_evento"), eventoId: z.uuid() }),
  z.object({ tipo: z.literal("visita_foto"), fotoId: z.uuid() }),
  z.object({ tipo: z.literal("carrinho"), fotoId: z.uuid() }),
]);

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  // Mesmo recusando, responde 204: a métrica nunca atrapalha quem está navegando.
  if (limiteAtingido(ip)) return new Response(null, { status: 204 });
  const texto = await request.text().catch(() => "");
  if (texto.length > 500) return new Response(null, { status: 204 });
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  const dados = corpo.safeParse(json);
  if (dados.success) await registrarMetrica(dados.data.tipo, dados.data);
  return new Response(null, { status: 204 });
}
