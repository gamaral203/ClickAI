import type { NextRequest } from "next/server";
import { z } from "zod";

import { dispositionDeAnexo } from "@/lib/r2";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { fotoComMoldura } from "@/servicos/molduras";
import { usuarioAtual } from "@/servicos/sessao";

// Foto comprada com a moldura do evento (docs/arquitetura.md, "Moldura do evento"). Mesma regra
// do original: token do link (convidado) ou sessão do cliente dono de um pedido pago, conferidos
// em src/servicos/molduras.ts. A imagem é composta na hora e não fica guardada em lugar nenhum.

// Ler o original e compor leva alguns segundos numa foto grande.
export const maxDuration = 30;

const token = z.string().min(20).max(400).nullable();

function indisponivel(status = 404, texto = "Download indisponível.") {
  return new Response(texto, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/compras/moldura/[itemId]">,
) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { itemId } = await params;
  const busca = request.nextUrl.searchParams;
  const credencialDoLink = token.safeParse(busca.get("token"));
  if (!credencialDoLink.success) return indisponivel();

  // Primeiro IP da cadeia de proxies (a Vercel preenche x-forwarded-for).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const usuario = await usuarioAtual();
  const resultado = await fotoComMoldura(
    itemId,
    busca.get("formato"),
    { token: credencialDoLink.data, clienteId: usuario?.id },
    ip,
  );
  if (!resultado.ok) {
    return resultado.motivo === "limite"
      ? indisponivel(429, "Muitos downloads seguidos. Espere alguns minutos e tente de novo.")
      : indisponivel();
  }
  return new Response(new Uint8Array(resultado.imagem), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": dispositionDeAnexo(resultado.nomeArquivo),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
