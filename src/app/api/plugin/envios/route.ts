import { z } from "zod";

import { MULTIPART_A_PARTIR_DE } from "@/lib/limites-envio";
import { DADOS_DO_FORMATO, FORMATOS_ACEITOS } from "@/lib/tipos-imagem";
import { iniciarEnvio } from "@/servicos/envios";
import { limiteAtingido } from "@/servicos/limites";

import { comChave, corpoJson, resposta } from "../comum";

// Plugin do Lightroom, passo 1 do envio (o mesmo do painel, src/servicos/envios.ts,
// iniciarEnvio): registra as fotos exportadas em `processando` e devolve, para cada uma, a URL
// assinada para o plugin mandar o arquivo direto ao R2 (PUT, com o Content-Type devolvido), ou
// `repetida` se a mesma foto já está no evento. Depois do PUT, o plugin chama
// /api/plugin/envios/confirmar com o id. O arquivo nunca passa por aqui.
//
// Só fotos, e só abaixo do tamanho do envio em partes: o JPEG exportado pelo Lightroom fica bem
// abaixo disso, e o plugin não precisa do vai e volta das partes.

export const maxDuration = 30;

/** Fotos por chamada: o plugin exporta e envia em lotes deste tamanho. */
const FOTOS_POR_CHAMADA = 20;

const pedido = z.object({
  eventoId: z.uuid(),
  arquivos: z
    .array(
      z.object({
        nome: z.string(),
        tamanhoBytes: z.number().int().positive().lt(MULTIPART_A_PARTIR_DE),
        hash: z.string(),
        formato: z.enum(FORMATOS_ACEITOS),
      }),
    )
    .min(1)
    .max(FOTOS_POR_CHAMADA),
});

export async function POST(request: Request) {
  return comChave(request, async (dono) => {
    const dados = pedido.safeParse(await corpoJson(request, 64 * 1024));
    if (!dados.success) {
      return resposta(
        {
          erro:
            `Envie até ${FOTOS_POR_CHAMADA} fotos por vez, em JPEG, PNG, WebP, TIFF ou AVIF, ` +
            `com menos de ${MULTIPART_A_PARTIR_DE / 1024 / 1024} MB cada.`,
        },
        400,
      );
    }
    if (await limiteAtingido("url_envio_usuario", dono.fotografoId)) {
      return resposta({ erro: "Muitos envios seguidos. Espere alguns minutos e continue." }, 429);
    }
    const { eventoId, arquivos } = dados.data;
    const r = await iniciarEnvio(dono.fotografoId, eventoId, arquivos);
    if ("erro" in r) return resposta({ erro: r.erro }, 422);
    return resposta({
      itens: r.itens.map((item, i) => {
        if ("repetida" in item) return { repetida: true };
        // Abaixo do tamanho das partes, iniciarEnvio sempre devolve uma URL só.
        if (!("url" in item)) throw new Error("envio em partes inesperado no plugin");
        return {
          fotoId: item.fotoId,
          url: item.url,
          tipo: DADOS_DO_FORMATO[arquivos[i].formato].mime,
        };
      }),
    });
  });
}
