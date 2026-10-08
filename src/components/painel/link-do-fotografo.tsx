"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, MessageCircle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

/** O link próprio do fotógrafo (/fotografo/<endereço>), para divulgar só os eventos dele. */
export function LinkDoFotografo({ url, nome }: { url: string; nome: string }) {
  const [copiado, setCopiado] = useState(false);
  const mensagem = `📸 Veja as fotos dos meus eventos no ClicouAí e encontre as suas com uma selfie: ${url}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-accent/40 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Link2 aria-hidden="true" className="size-5 text-primary" />
          Seu link
        </h2>
        <p className="text-sm text-muted-foreground">
          Divulgue este link nas redes e no WhatsApp: quem entra vê só os eventos de {nome}.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          aria-label="Seu link"
          onFocus={(e) => e.target.select()}
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <div className="flex gap-2">
          <Button type="button" size="touch" onClick={copiar} className="flex-1 sm:flex-none">
            {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Enviar o link no WhatsApp"
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <MessageCircle aria-hidden="true" />
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir o seu link"
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </div>
      <p role="status" className="sr-only">
        {copiado ? "Link copiado" : ""}
      </p>
    </section>
  );
}
