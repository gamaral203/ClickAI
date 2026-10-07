"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Compartilha a página do evento. No celular abre o compartilhamento do sistema (WhatsApp,
 * Instagram…); onde não há, copia o link.
 */
export function BotaoCompartilhar({ url, titulo }: { url: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function compartilhar() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: titulo, text: `Fotos de ${titulo}`, url });
        return;
      } catch (erro) {
        // Fechou a janela de compartilhar: não faz nada. Outro erro: tenta copiar.
        if (erro instanceof DOMException && erro.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão para copiar: o endereço continua na barra do navegador.
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="touch" className="w-fit" onClick={compartilhar}>
        {copiado ? (
          <Check aria-hidden="true" data-icon="inline-start" />
        ) : (
          <Share2 aria-hidden="true" data-icon="inline-start" />
        )}
        {copiado ? "Link copiado" : "Compartilhar"}
      </Button>
      <p role="status" className="sr-only">
        {copiado ? "Link copiado" : ""}
      </p>
    </>
  );
}
