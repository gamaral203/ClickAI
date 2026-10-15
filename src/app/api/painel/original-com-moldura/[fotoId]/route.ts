import type { NextRequest } from "next/server";

import { dispositionDeAnexo } from "@/lib/r2";
import { ipDaRequisicao } from "@/servicos/limites";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { fotoDoAutorComMoldura } from "@/servicos/molduras";
import { usuarioAtual } from "@/servicos/sessao";

// Foto do AUTOR com a moldura do evento, para divulgar o evento nas redes (docs/arquitetura.md,
// "Moldura do evento"). Mesma regra do "Baixar original" do painel: só a conta de fotógrafo que
// enviou a foto, com a liberação do evento (verificação em duas etapas, se ligada) e limite por
// usuário, tudo conferido em src/servicos/molduras.ts. A imagem é composta na hora e não fica
// guardada em lugar nenhum. `?formato=story` ou `?formato=feed`.

// Ler o original e compor leva alguns segundos numa foto grande.
export const maxDuration = 30;

const MENSAGENS = {
  nao_encontrado: { status: 404, texto: "Foto não encontrada." },
  liberacao: {
    status: 403,
    texto: "A liberação do download venceu. Clique no botão de novo para liberar.",
  },
  limite: { status: 429, texto: "Muitos downloads seguidos. Espere alguns minutos." },
  indisponivel: { status: 404, texto: "Esta foto não pode ser baixada com a moldura." },
} as const;

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/painel/original-com-moldura/[fotoId]">,
) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  const { fotoId } = await params;
  const busca = request.nextUrl.searchParams;
  const resultado = await fotoDoAutorComMoldura(
    await usuarioAtual(),
    { fotoId, formato: busca.get("formato"), liberacao: busca.get("liberacao") },
    await ipDaRequisicao(),
  );
  if (!resultado.ok) {
    const { status, texto } = MENSAGENS[resultado.motivo];
    return new Response(texto, {
      status,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
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
