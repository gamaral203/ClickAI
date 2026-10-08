"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const INSTAGRAM = "@clicouai";

/**
 * Compartilhar a foto comprada (no celular, pela tela de compartilhar do aparelho, de onde se
 * escolhe o Instagram). Vai o original, sem marca d'água, com a legenda marcando o ClicouAí.
 * Sem suporte a compartilhar arquivo (computador) ou se o armazenamento recusar a leitura, a
 * pessoa copia a legenda e baixa a foto para postar.
 */
export function CompartilharFoto({
  urlDownload,
  eventoTitulo,
}: {
  urlDownload: string;
  eventoTitulo: string;
}) {
  const [estado, setEstado] = useState<"parado" | "preparando" | "legenda" | "copiada">("parado");
  const legenda = `📸 Minha foto em ${eventoTitulo}! Encontrei pela selfie no ${INSTAGRAM} 🙌`;

  async function compartilhar() {
    setEstado("preparando");
    try {
      const resposta = await fetch(urlDownload);
      if (!resposta.ok) throw new Error("download");
      const arquivo = new File([await resposta.blob()], "foto-clicouai.jpg", {
        type: "image/jpeg",
      });
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], text: legenda });
        setEstado("parado");
        return;
      }
    } catch (erro) {
      // A pessoa fechou a tela de compartilhar: não é erro.
      if (erro instanceof DOMException && erro.name === "AbortError") {
        setEstado("parado");
        return;
      }
    }
    setEstado("legenda");
  }

  async function copiarLegenda() {
    try {
      await navigator.clipboard.writeText(legenda);
      setEstado("copiada");
    } catch {
      setEstado("legenda");
    }
  }

  if (estado === "legenda" || estado === "copiada") {
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg bg-muted p-3 text-sm">
        <p>
          Baixe a foto e poste no Instagram com esta legenda, marcando o{" "}
          <strong>{INSTAGRAM}</strong>:
        </p>
        <p className="rounded-md bg-background p-2 text-xs">{legenda}</p>
        <Button size="sm" variant="outline" onClick={copiarLegenda} className="w-fit">
          {estado === "copiada" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {estado === "copiada" ? "Legenda copiada" : "Copiar legenda"}
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="touch" onClick={compartilhar} disabled={estado === "preparando"}>
      {estado === "preparando" ? (
        <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
      ) : (
        <Share2 aria-hidden="true" data-icon="inline-start" />
      )}
      Compartilhar
    </Button>
  );
}
