"use client";

import Image from "next/image";
import { ImageUp, Loader2, Trash2 } from "lucide-react";

import type { ImagemDaLoja } from "@/app/(fotografo)/painel/loja/acoes";
import { BlocoRecolhivel } from "@/components/painel/bloco-recolhivel";
import { TIPOS_DE_IMAGEM, useImagemDaLoja } from "@/components/painel/usar-imagem-da-loja";
import { Button } from "@/components/ui/button";

/**
 * Banner e logo da página pública do fotógrafo (o link que ele divulga e a loja). O banner
 * aparece no topo, atrás do nome; o logo, no lugar da inicial.
 */
export function ImagensDaLoja({ capa, logo }: { capa: string | null; logo: string | null }) {
  return (
    <BlocoRecolhivel titulo="Banner e logo" aberto>
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
          ajuda="Quadrada, aparece num círculo ao lado do nome. É a mesma foto de Perfil e recebimento, onde também dá para trocá-la; sem ela, aparece o seu avatar."
          atual={logo}
          formato="aspect-square max-w-40 rounded-full"
        />
      </div>
    </BlocoRecolhivel>
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
  const { ocupado, erro, enviar, remover } = useImagemDaLoja(campo);

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
            accept={TIPOS_DE_IMAGEM}
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
