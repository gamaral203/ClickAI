import type { NextRequest } from "next/server";
import { z } from "zod";

import { vemDoMesmoSite } from "@/lib/mesma-origem";
import { assinarPartes, concluirPartes } from "@/servicos/envios";
import { limiteAtingido } from "@/servicos/limites";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// Upload em partes (multipart) dos arquivos grandes (docs/arquitetura.md, "Upload"): assina de
// novo as partes cuja URL venceu e fecha o upload com os ETags que o R2 devolveu ao navegador.
// As partes vão direto do navegador ao R2: aqui só passam ids, números e ETags (corpo de
// poucos KB). É uma rota, e não uma Server Action, para não esperar na fila das Server Actions
// da página (o Next despacha uma por vez) enquanto os lotes de URLs são pedidos.

export const maxDuration = 30;

/** Corpo máximo: 20 partes com ETag e o id do upload cabem com folga. */
const MAXIMO_DO_CORPO = 8 * 1024;

const corpo = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("assinar"),
    fotoId: z.uuid(),
    uploadId: z.string(),
    numeros: z.unknown(),
  }),
  z.object({
    acao: z.literal("concluir"),
    fotoId: z.uuid(),
    uploadId: z.string(),
    partes: z.unknown(),
  }),
]);

function resposta(dados: object, status = 200) {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!vemDoMesmoSite(request)) return resposta({ erro: "Origem não permitida." }, 403);
  const usuario = await usuarioAtual();
  if (!usuario) return resposta({ erro: "Entre de novo para continuar o envio." }, 401);
  const conta = await contaDoPainel(usuario);
  if (!conta) return resposta({ erro: "Sem acesso ao painel." }, 403);

  const texto = await request.text().catch(() => "");
  if (texto.length > MAXIMO_DO_CORPO) return resposta({ erro: "Pedido inválido." }, 400);
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  const dados = corpo.safeParse(json);
  if (!dados.success) return resposta({ erro: "Pedido inválido." }, 400);

  if (dados.data.acao === "assinar") {
    // Mesmo limite das URLs de envio: segura quem tenta gerar URLs assinadas sem parar.
    if (await limiteAtingido("url_envio_usuario", conta.id)) {
      return resposta({ erro: "Muitos envios seguidos. Espere alguns minutos e continue." }, 429);
    }
    const r = await assinarPartes(conta.id, dados.data.fotoId, {
      uploadId: dados.data.uploadId,
      numeros: dados.data.numeros,
    });
    if ("erro" in r) return resposta({ erro: r.erro }, 422);
    return resposta(r);
  }

  // Confere dono e status: só fecha o upload de foto em `processando` desta conta.
  const r = await concluirPartes(conta.id, dados.data.fotoId, {
    uploadId: dados.data.uploadId,
    partes: dados.data.partes,
  });
  if ("erro" in r) {
    return resposta({ erro: r.erro }, r.reiniciar ? 409 : r.tentarDeNovo ? 503 : 422);
  }
  return resposta({ ok: true });
}
