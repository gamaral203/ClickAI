import type { NextRequest } from "next/server";

import { miniaturaSemMarca } from "@/servicos/miniatura-sem-marca";
import { usuarioAtual } from "@/servicos/sessao";
import { respostaDaManutencao } from "@/servicos/manutencao";

// Miniatura sem marca d'água de uma foto, só para o autor dela (Meus clientes, no painel). Tudo é
// conferido no servidor (src/servicos/miniatura-sem-marca.ts). A foto pronta não muda: o
// navegador guarda a imagem por 7 dias, só para ele (cache privado, nunca numa CDN).

const STATUS = { nao_encontrado: 404, limite: 429, indisponivel: 404 } as const;

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/painel/sem-marca/[fotoId]">,
) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { fotoId } = await params;
  const resultado = await miniaturaSemMarca(await usuarioAtual(), fotoId);
  if (!resultado.ok) {
    return new Response(null, {
      status: STATUS[resultado.motivo],
      headers: { "Cache-Control": "no-store" },
    });
  }
  return new Response(new Uint8Array(resultado.imagem), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
