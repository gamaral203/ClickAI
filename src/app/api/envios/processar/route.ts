import type { NextRequest } from "next/server";
import { z } from "zod";

import { vemDoMesmoSite } from "@/lib/mesma-origem";
import { confirmarEnvio } from "@/servicos/envios";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// Processa uma foto que o navegador acabou de enviar ao R2 (docs/arquitetura.md, "Upload"):
// confere o arquivo, gera prévia e miniatura com marca d'água, move o original e cadastra os
// rostos (src/servicos/envios.ts, confirmarEnvio). É uma rota, não uma Server Action, porque o
// Next despacha as Server Actions de uma página uma por vez: aqui o painel processa várias
// fotos ao mesmo tempo (cada chamada é uma função separada) enquanto continua subindo as
// próximas. O arquivo não passa por aqui: só o id da foto.

/** Uma foto por chamada: cabe com folga no tempo da função, mesmo com um original de 30 MB. */
export const maxDuration = 60;

const corpo = z.object({ fotoId: z.uuid() });

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
  if (texto.length > 200) return resposta({ erro: "Pedido inválido." }, 400);
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  const dados = corpo.safeParse(json);
  if (!dados.success) return resposta({ erro: "Pedido inválido." }, 400);

  // Confere dono e status: só processa foto em `processando` enviada por esta conta.
  const resultado = await confirmarEnvio(conta.id, dados.data.fotoId);
  if ("erro" in resultado) return resposta({ erro: resultado.erro }, 422);
  return resposta({ ok: true });
}
