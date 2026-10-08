"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";

import {
  enviarImagemDaLojaAcao,
  removerImagemDaLojaAcao,
  type ImagemDaLoja,
} from "@/app/(fotografo)/painel/loja/acoes";
import { Button } from "@/components/ui/button";

/** Limite da Server Action é 1 MB: a imagem é reduzida no aparelho antes de subir. */
const TETO_BYTES = 900 * 1024;
const LADO_MAXIMO: Record<ImagemDaLoja, number> = { capa: 1920, fotoPerfil: 400 };

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
 * Banner e logo da página pública do fotógrafo (o link que ele divulga e a loja). O banner
 * aparece no topo, atrás do nome; o logo, no lugar da inicial.
 */
export function ImagensDaLoja({ capa, logo }: { capa: string | null; logo: string | null }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-lg font-semibold">Banner e logo</legend>
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CampoImagem
          campo="capa"
          rotulo="Imagem principal do banner"
          ajuda="Aparece no topo da sua página, atrás do nome. Use uma foto na horizontal (ideal 1920 × 640)."
          atual={capa}
          formato="aspect-[3/1]"
        />
        <CampoImagem
          campo="fotoPerfil"
          rotulo="Logo ou foto de perfil"
          ajuda="Quadrada, aparece num círculo ao lado do nome."
          atual={logo}
          formato="aspect-square max-w-40 rounded-full"
        />
      </div>
    </fieldset>
  );
}

function CampoImagem({
  campo,
  rotulo,
  ajuda,
  atual,
  formato,
}: {
  campo: ImagemDaLoja;
  rotulo: string;
  ajuda: string;
  atual: string | null;
  formato: string;
}) {
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

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{rotulo}</span>
      <div className={`relative w-full overflow-hidden border bg-muted ${formato}`}>
        {atual ? (
          <Image
            src={atual}
            alt=""
            fill
            sizes="(min-width: 768px) 600px, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Sem imagem
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{ajuda}</p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent has-disabled:pointer-events-none has-disabled:opacity-50">
          {ocupado ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ImageUp aria-hidden="true" className="size-4" />
          )}
          {atual ? "Trocar imagem" : "Enviar imagem"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={ocupado}
            onChange={(e) => {
              void enviar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {atual && (
          <Button type="button" variant="ghost" size="touch" disabled={ocupado} onClick={remover}>
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            Remover
          </Button>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
