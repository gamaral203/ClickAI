"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";

import {
  confirmarCodigoEmailAcao,
  reenviarCodigoEmailAcao,
  type EstadoCodigoEmail,
} from "@/app/(cliente)/conta/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoCodigoEmail = {};

/**
 * Código de 6 dígitos da confirmação do e-mail (/cadastro/codigo). O campo aceita o
 * preenchimento automático do celular (`one-time-code`) e envia sozinho ao completar os 6
 * dígitos. "Reenviar código" só libera depois da espera de 60 segundos.
 */
export function FormularioCodigoEmail({ esperaInicial }: { esperaInicial: number }) {
  const [estado, acao, enviando] = useActionState(confirmarCodigoEmailAcao, inicial);
  const [reenvio, reenviar, reenviando] = useActionState(reenviarCodigoEmailAcao, inicial);
  const formulario = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-6">
      <form ref={formulario} action={acao} className="flex flex-col gap-4">
        {estado.erro && (
          <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
            {estado.erro}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="codigo">Código de confirmação</Label>
          <Input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            spellCheck={false}
            aria-invalid={Boolean(estado.erro)}
            aria-describedby="codigo-ajuda"
            placeholder="000000"
            className="h-14 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-muted-foreground/40 md:text-2xl"
            onChange={(e) => {
              const digitos = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
              if (digitos !== e.currentTarget.value) e.currentTarget.value = digitos;
              if (digitos.length === 6 && !enviando) formulario.current?.requestSubmit();
            }}
          />
          <p id="codigo-ajuda" className="text-sm text-muted-foreground">
            6 números. O código vale por 15 minutos.
          </p>
        </div>
        <Button type="submit" size="touch" disabled={enviando}>
          {enviando && (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          )}
          Confirmar e-mail
        </Button>
      </form>

      <form action={reenviar} className="flex flex-col items-center gap-2 text-center">
        {reenvio.aviso && (
          <p role="status" className="text-sm text-foreground">
            {reenvio.aviso}
          </p>
        )}
        {reenvio.erro && (
          <p role="alert" className="text-sm text-destructive">
            {reenvio.erro}
          </p>
        )}
        <BotaoReenviar
          // Cada resposta do reenvio recomeça a contagem com a espera que o servidor mandou.
          key={`${reenvio.espera ?? esperaInicial}-${reenvio.aviso ?? reenvio.erro ?? ""}`}
          espera={reenvio.espera ?? esperaInicial}
          reenviando={reenviando}
        />
      </form>
    </div>
  );
}

export function BotaoReenviar({ espera, reenviando }: { espera: number; reenviando: boolean }) {
  const [restante, setRestante] = useState(espera);
  useEffect(() => {
    if (restante <= 0) return;
    const relogio = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(relogio);
  }, [restante]);
  const bloqueado = restante > 0 || reenviando;
  return (
    <Button type="submit" variant="ghost" size="touch" disabled={bloqueado}>
      {reenviando ? (
        <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
      ) : (
        <RotateCw aria-hidden="true" data-icon="inline-start" />
      )}
      {restante > 0 ? `Reenviar código em ${restante} s` : "Reenviar código"}
    </Button>
  );
}
