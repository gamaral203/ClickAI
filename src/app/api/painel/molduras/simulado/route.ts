import type { NextRequest } from "next/server";

import { LIMITE_MOLDURA_BYTES, LIMITE_MOLDURA_TEXTO } from "@/lib/moldura";
import { vemDoMesmoSite } from "@/lib/mesma-origem";
import { modoEnvio } from "@/lib/r2";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { salvarMolduraSimulada } from "@/servicos/molduras";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// Envio SIMULADO da moldura do evento: só fora da produção e sem o R2 configurado, no lugar do
// PUT na URL assinada (que precisa do R2). Com o R2, esta rota recusa tudo: o arquivo vai direto
// do navegador ao bucket (src/servicos/molduras.ts, iniciarEnvioDeMoldura).

function resposta(corpo: { erro?: string }, status = 200) {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  if (modoEnvio() !== "simulado") return resposta({ erro: "Envio simulado desligado." }, 404);
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
  if (!vemDoMesmoSite(request)) return resposta({ erro: "Origem não permitida." }, 403);
  const usuario = await usuarioAtual();
  const conta = usuario ? await contaDoPainel(usuario) : null;
  if (!conta) return resposta({ erro: "Entre na sua conta de fotógrafo." }, 401);

  const tamanho = Number(request.headers.get("content-length") ?? "0");
  if (tamanho > LIMITE_MOLDURA_BYTES) {
    return resposta({ erro: `A moldura passa de ${LIMITE_MOLDURA_TEXTO}.` }, 413);
  }
  const conteudo = Buffer.from(await request.arrayBuffer());
  if (conteudo.length > LIMITE_MOLDURA_BYTES) {
    return resposta({ erro: `A moldura passa de ${LIMITE_MOLDURA_TEXTO}.` }, 413);
  }
  const busca = request.nextUrl.searchParams;
  const resultado = await salvarMolduraSimulada(
    conta.id,
    { eventoId: busca.get("evento"), formato: busca.get("formato") },
    conteudo,
  );
  // Moldura recusada na conferência responde 200 com o motivo, como as Server Actions do envio
  // real: é resposta esperada da tela, não falha da requisição.
  return resposta(resultado.ok ? {} : { erro: resultado.erro });
}
