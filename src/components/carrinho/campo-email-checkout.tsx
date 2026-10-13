"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { sugerirEmail } from "@/lib/sugestao-email";

/**
 * Campo de e-mail do checkout com "Você quis dizer …?": ao sair do campo, um domínio que parece
 * errado (gmial.com, hotmal.com) ganha a sugestão, que corrige com um toque. O link das fotos vai
 * para este e-mail: um erro aqui é o cliente sem as fotos.
 */
export function CampoEmailCheckout({
  valorInicial,
  invalido,
  descritoPor,
}: {
  valorInicial?: string;
  invalido: boolean;
  descritoPor: string;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [sugestao, setSugestao] = useState<string | null>(null);
  return (
    <>
      <Input
        ref={campo}
        id="email"
        name="email"
        defaultValue={valorInicial}
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        maxLength={254}
        aria-invalid={invalido}
        aria-describedby={sugestao ? `${descritoPor} email-sugestao` : descritoPor}
        onBlur={(e) => setSugestao(sugerirEmail(e.target.value))}
        onChange={() => sugestao && setSugestao(null)}
        className="h-11"
      />
      {sugestao && (
        <p id="email-sugestao" role="status" className="text-sm">
          Você quis dizer{" "}
          <button
            type="button"
            onClick={() => {
              if (campo.current) campo.current.value = sugestao;
              setSugestao(null);
              campo.current?.focus();
            }}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {sugestao}
          </button>
          ?
        </p>
      )}
    </>
  );
}
