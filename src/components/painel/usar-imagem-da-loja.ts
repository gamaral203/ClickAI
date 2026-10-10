"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  enviarImagemDaLojaAcao,
  removerImagemDaLojaAcao,
  type ImagemDaLoja,
} from "@/app/(fotografo)/painel/loja/acoes";

/** Limite da Server Action é 1 MB: a imagem é reduzida no aparelho antes de subir. */
const TETO_BYTES = 900 * 1024;
const LADO_MAXIMO: Record<ImagemDaLoja, number> = { capa: 1920, fotoPerfil: 400 };

/** Tipos aceitos no seletor de arquivo (o servidor regrava tudo em WebP). */
export const TIPOS_DE_IMAGEM = "image/jpeg,image/png,image/webp";

/** Reduz no navegador (canvas) para JPEG, baixando a qualidade até caber no limite. */
async function reduzir(arquivo: File, ladoMaximo: number): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const qualidade of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
    if (blob && blob.size <= TETO_BYTES) return blob;
  }
  throw new Error("grande");
}

/**
 * Envio e remoção do banner (`capa`) ou da foto de perfil (`fotoPerfil`). Usado em Minha loja e
 * em Perfil e recebimento: o mesmo fluxo (reduz no aparelho, a Server Action regrava com o sharp
 * e guarda no R2) e a mesma action, para as duas telas nunca divergirem.
 */
export function useImagemDaLoja(campo: ImagemDaLoja) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setOcupado(true);
    try {
      const dados = new FormData();
      dados.set("arquivo", await reduzir(arquivo, LADO_MAXIMO[campo]), "imagem.jpg");
      const resultado = await enviarImagemDaLojaAcao(campo, dados);
      if (resultado.ok) router.refresh();
      else setErro(resultado.erro);
    } catch {
      setErro("Não conseguimos ler esta imagem. Envie um JPEG ou PNG.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setErro(null);
    setOcupado(true);
    const resultado = await removerImagemDaLojaAcao(campo);
    setOcupado(false);
    if (resultado.ok) router.refresh();
    else setErro(resultado.erro);
  }

  return { ocupado, erro, enviar, remover };
}
