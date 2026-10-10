"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { Loader2 } from "lucide-react";

import {
  confirmarCodigoLoginAcao,
  reenviarCodigoLoginAcao,
  type EstadoCodigoLogin,
} from "@/app/(cliente)/conta/acoes";
import { BotaoReenviar } from "@/components/conta/formulario-codigo-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoCodigoLogin = {};

/**
 * Segunda etapa do login (/entrar/codigo). Com o código por e-mail (gestor), o campo é numérico,
 * aceita o preenchimento automático do celular (`one-time-code`), envia sozinho aos 6 dígitos e
 * tem "Reenviar código" com espera de 60 segundos. Com o app autenticador ligado, o mesmo campo
 * aceita o código do app ou um código de recuperação.
 */
export function FormularioCodigoLogin({
  porEmail,
  totp,
}: {
  /** Código enviado por e-mail (gestor): segundos até poder pedir outro. */
  porEmail: { espera: number } | null;
  totp: boolean;
}) {
  const [estado, acao, enviando] = useActionState(confirmarCodigoLoginAcao, inicial);
  const [reenvio, reenviar, reenviando] = useActionState(reenviarCodigoLoginAcao, inicial);
  const formulario = useRef<HTMLFormElement>(null);
  // Só o código do e-mail: o campo aceita só os 6 números. Com o app, também o de recuperação.
  const soNumeros = Boolean(porEmail) && !totp;

  return (
    <div className="flex flex-col gap-6">
      <form ref={formulario} action={acao} className="flex flex-col gap-4">
        {!porEmail && (
          <p className="text-muted-foreground">
            Abra o app autenticador (Google Authenticator, Authy…) e digite o código de 6 dígitos do
            ClicouAí. Sem o celular, use um dos códigos de recuperação.
          </p>
        )}
        {estado.erro && (
          <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
            {estado.erro}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="codigo">{porEmail ? "Código de acesso" : "Código"}</Label>
          {porEmail ? (
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              pattern={soNumeros ? "[0-9]*" : undefined}
              maxLength={soNumeros ? 6 : 40}
              required
              autoFocus
              spellCheck={false}
              aria-invalid={Boolean(estado.erro)}
              aria-describedby="codigo-ajuda"
              placeholder="000000"
              className="h-14 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-muted-foreground/40 md:text-2xl"
              onChange={(e) => {
                const valor = e.currentTarget.value;
                const digitos = valor.replace(/\D/g, "").slice(0, 6);
                if (soNumeros && digitos !== valor) e.currentTarget.value = digitos;
                if (/^\d{6}$/.test(e.currentTarget.value) && !enviando) {
                  formulario.current?.requestSubmit();
                }
              }}
            />
          ) : (
            <Input
              id="codigo"
              name="codigo"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={40}
              autoFocus
              className="h-11 text-lg tracking-widest"
              aria-invalid={Boolean(estado.erro)}
            />
          )}
          {porEmail && (
            <p id="codigo-ajuda" className="text-sm text-muted-foreground">
              6 números. O código vale por 10 minutos e funciona uma vez só.
            </p>
          )}
        </div>
        <Button type="submit" size="touch" disabled={enviando}>
          {enviando && (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          )}
          Confirmar e entrar
        </Button>
      </form>

      {porEmail ? (
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
            key={`${reenvio.espera ?? porEmail.espera}-${reenvio.aviso ?? reenvio.erro ?? ""}`}
            espera={reenvio.espera ?? porEmail.espera}
            reenviando={reenviando}
          />
          <p className="text-sm text-muted-foreground">
            Não recebeu? Confira o spam e a aba Promoções. Ainda nada?{" "}
            <Link href="/ajuda" className="font-medium text-primary hover:underline">
              Fale com a gente
            </Link>
          </p>
        </form>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Perdeu o celular e os códigos?{" "}
          <Link href="/ajuda" className="font-medium text-primary hover:underline">
            Fale com a gente
          </Link>
        </p>
      )}
    </div>
  );
}
