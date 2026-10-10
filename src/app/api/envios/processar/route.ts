import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { vemDoMesmoSite } from "@/lib/mesma-origem";
import {
  confirmarEnvio,
  processarEmSegundoPlano,
  type TemposDoProcessamento,
} from "@/servicos/envios";
import { contaDoPainel, usuarioAtual } from "@/servicos/sessao";

// Processa fotos que o navegador acabou de enviar ao R2 (docs/arquitetura.md, "Upload"):
// confere o arquivo, gera prévia e miniatura com marca d'água, move o original e cadastra os
// rostos (src/servicos/envios.ts, confirmarEnvio). É uma rota, não uma Server Action, porque o
// Next despacha as Server Actions de uma página uma por vez: aqui o painel processa várias
// fotos ao mesmo tempo (cada chamada é uma função separada) enquanto continua subindo as
// próximas. O arquivo não passa por aqui: só o id da foto.
//
// Dois jeitos de chamar:
//   { fotoId }   processa agora e responde quando a foto está pronta;
//   { fotoIds }  entrega ao servidor as fotos que já subiram e responde 202 na hora: elas são
//                processadas depois da resposta, mesmo que a página feche (a tela de envio usa
//                quando os uploads terminam e ao fechar a página, por sendBeacon).
// As duas são idempotentes: a foto é reservada antes de processar (src/dados/processamento.ts).

/**
 * Tempo máximo da função (o padrão e o teto do plano Hobby com Fluid Compute). Uma foto leva
 * segundos (medido localmente, com 1 thread: TIFF de 16 bits de 60 MP em ~1,4 s; a leitura do
 * R2 soma alguns); o teto serve às entregas em segundo plano. A memória fica no padrão do plano
 * Hobby (2 GB, sem como aumentar).
 */
export const maxDuration = 300;

/** Fotos por entrega em segundo plano (a tela divide a fila em entregas deste tamanho). */
const FOTOS_POR_ENTREGA = 100;
/** Até quando a entrega começa fotos novas, com folga para a última terminar antes do teto. */
const PRAZO_DA_ENTREGA_MS = 240 * 1000;

const corpo = z.union([
  z.object({ fotoId: z.uuid() }).strict(),
  z.object({ fotoIds: z.array(z.uuid()).min(1).max(FOTOS_POR_ENTREGA) }).strict(),
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

  // 100 ids de 36 caracteres, com aspas e vírgulas, cabem com folga em 5 KB.
  const texto = await request.text().catch(() => "");
  if (texto.length > 5000) return resposta({ erro: "Pedido inválido." }, 400);
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  const dados = corpo.safeParse(json);
  if (!dados.success) return resposta({ erro: "Pedido inválido." }, 400);

  if ("fotoIds" in dados.data) {
    // Só as fotos desta conta em `processando` são processadas (confirmarEnvio confere).
    const fotoIds = dados.data.fotoIds;
    const fotografoId = conta.id;
    after(() => processarEmSegundoPlano(fotografoId, fotoIds, PRAZO_DA_ENTREGA_MS));
    return resposta({ ok: true, entregues: fotoIds.length }, 202);
  }

  // Confere dono e status: só processa foto em `processando` enviada por esta conta.
  // Tempos de cada etapa (só números), para a telemetria da tela de envio.
  const tempos: TemposDoProcessamento = {};
  const resultado = await confirmarEnvio(conta.id, dados.data.fotoId, { tempos });
  if ("erro" in resultado) return resposta({ erro: resultado.erro, tempos }, 422);
  return resposta({ ok: true, emAndamento: "emAndamento" in resultado, tempos });
}
