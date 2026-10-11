"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";

import { definirCapaDoEvento, definirCapaEnviada, MEDIDAS_CAPA_ENVIADA } from "@/dados";
import { ERRO_SEM_ARMAZENAMENTO, gravarPublico, modoEnvio } from "@/lib/r2";
import { exigirFotografo } from "@/servicos/sessao";

// Capa do evento (docs/arquitetura.md, "Capa do evento"). Server Actions são endpoints públicos:
// a entrada é validada aqui e a camada de dados só grava em evento do fotógrafo logado (dono) e
// com uma foto pronta e não excluída daquele mesmo evento (sem IDOR).

const entrada = z.object({
  eventoId: z.uuid(),
  /** `null`: remove a escolha e volta para a capa automática. */
  fotoId: z.uuid().nullable(),
});

const MENSAGEM = {
  evento: "Evento não encontrado.",
  foto: "Essa foto não pode ser a capa: ela precisa ser deste evento e já estar pronta.",
} as const;

/** Escolhe a foto de capa do evento, ou volta para a automática (`fotoId` nulo). */
export async function definirCapaAcao(dados: unknown): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const pedido = entrada.safeParse(dados);
  if (!pedido.success) return { erro: MENSAGEM.foto };
  const { eventoId, fotoId } = pedido.data;
  const resultado = await definirCapaDoEvento(eventoId, conta.id, fotoId);
  if (!resultado.ok) return { erro: MENSAGEM[resultado.motivo] };
  revalidatePath(`/painel/eventos/${eventoId}`);
  revalidatePath("/painel/eventos");
  return {};
}

/** O navegador já reduz a imagem antes de enviar; isto é só o teto (Server Action: até 1 MB). */
const LIMITE_IMAGEM_BYTES = 950 * 1024;

/**
 * Envia qualquer imagem como capa do evento (a arte, um cartaz). O servidor regrava em WebP
 * 1200×800 (3:2, o formato dos cartões) e guarda no bucket público; sem R2, fica em data:. Só o
 * dono: a camada de dados confere o `fotografo_id`.
 */
export async function enviarCapaAcao(
  eventoId: unknown,
  dados: FormData,
): Promise<{ erro?: string }> {
  const { conta } = await exigirFotografo("/painel/eventos");
  const id = z.uuid().safeParse(eventoId);
  if (!id.success) return { erro: MENSAGEM.evento };
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha uma imagem." };
  if (arquivo.size > LIMITE_IMAGEM_BYTES) {
    return { erro: "Imagem grande demais. Use uma de até 1 MB." };
  }
  const modo = modoEnvio();
  if (modo === "indisponivel") return { erro: ERRO_SEM_ARMAZENAMENTO };

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await arquivo.arrayBuffer()), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(MEDIDAS_CAPA_ENVIADA.largura, MEDIDAS_CAPA_ENVIADA.altura, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { erro: "Não conseguimos ler esta imagem. Envie um JPEG, PNG ou WebP." };
  }

  let valor: string;
  if (modo === "r2") {
    valor = `eventos/${id.data}/capa-${randomUUID()}.webp`;
    await gravarPublico(valor, webp, "image/webp");
  } else {
    valor = `data:image/webp;base64,${webp.toString("base64")}`;
  }
  const resultado = await definirCapaEnviada(id.data, conta.id, valor);
  if (!resultado.ok) return { erro: MENSAGEM.evento };
  revalidatePath(`/painel/eventos/${id.data}`);
  revalidatePath("/painel/eventos");
  return {};
}
