"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, SendHorizontal } from "lucide-react";

import { responderSuporteAcao } from "@/app/(admin)/admin/suporte/acoes";
import { Button } from "@/components/ui/button";

/** Caixa de resposta da gestão numa conversa do chat de ajuda. */
export function RespostaSuporte({ conversaId }: { conversaId: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startEnvio] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startEnvio(async () => {
          const r = await responderSuporteAcao({ conversaId, texto }).catch(() => ({
            erro: "Não foi possível enviar.",
          }));
          if (r.erro) return setErro(r.erro);
          setTexto("");
          router.refresh();
        });
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="resposta" className="font-semibold">
        Responder
      </label>
      <textarea
        id="resposta"
        rows={4}
        maxLength={4000}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="A resposta vai para o chat do fotógrafo, com notificação e e-mail."
        className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <Button type="submit" size="touch" disabled={enviando || !texto.trim()} className="self-end">
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <SendHorizontal aria-hidden="true" />
        )}
        Enviar resposta
      </Button>
    </form>
  );
}
