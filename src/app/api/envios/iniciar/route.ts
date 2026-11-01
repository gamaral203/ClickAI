import type { NextRequest } from "next/server";
import { z } from "zod";

import { vemDoMesmoSite } from "@/lib/mesma-origem";
import { iniciarEnvio } from "@/servicos/envios";
import { limiteAtingido } from "@/servicos/limites";
import { respostaDaManutencao } from "@/servicos/manutencao";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// Registra um lote de fotos e devolve as URLs assinadas (docs/arquitetura.md, "Upload"). O arquivo
// não passa por aqui: só nome, tamanho, formato e impressão. É uma rota, e não uma Server Action,
// porque o Next despacha as Server Actions de uma página uma por vez e não há como cancelar uma
// delas: um pedido preso seguraria todos os seguintes. Aqui a tela de envio aplica tempo-limite de
// verdade (AbortController) e tenta de novo, sem duplicar: iniciarEnvio reaproveita a foto de mesma
// impressão que ainda está em `processando`. Dono e colaborador são conferidos em iniciarEnvio.

export const maxDuration = 30;

/** 50 itens com nome de arquivo longo cabem com folga; o lote é validado em iniciarEnvio. */
const MAXIMO_DO_CORPO = 128 * 1024;

const corpo = z
  .object({
    eventoId: z.uuid(),
    lista: z.array(z.unknown()),
    liberacao: z.unknown().optional(),
    pastaId: z.unknown().optional(),
  })
  .strict();

function resposta(dados: object, status = 200) {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  // Modo de manutenção (docs/arquitetura.md, "Modo de manutenção"): 503 para quem não é gestor.
  const manutencao = await respostaDaManutencao(request);
  if (manutencao) return manutencao;
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

  if (await limiteAtingido("url_envio_usuario", conta.id)) {
    return resposta({ erro: "Muitos envios seguidos. Espere alguns minutos e continue." }, 429);
  }
  const r = await iniciarEnvio(
    conta.id,
    dados.data.eventoId,
    dados.data.lista,
    dados.data.liberacao ?? null,
    dados.data.pastaId ?? null,
  );
  if ("erro" in r) return resposta({ erro: r.erro }, 422);
  return resposta(r);
}
