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
 * Segunda etapa do login (/entrar/codigo): o código enviado ao e-mail da conta (gestor e quem
 * ligou a verificação em duas etapas; desde 16/10/2026 não há mais o app autenticador). O campo é
 * numérico, aceita o preenchimento automático do celular (`one-time-code`), envia sozinho aos 6
 * dígitos e tem "Reenviar código" (que manda o mesmo código enquanto ele vale).
 */
export function FormularioCodigoLogin({ espera }: { espera: number }) {
  const [estado, acao, enviando] = useActionState(confirmarCodigoLoginAcao, inicial);
  const [reenvio, reenviar, reenviando] = useActionState(reenviarCodigoLoginAcao, inicial);
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
          <Label htmlFor="codigo">Código de acesso</Label>
          <Input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
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
              const valor = e.currentTarget.value;
              const digitos = valor.replace(/\D/g, "").slice(0, 6);
              if (digitos !== valor) e.currentTarget.value = digitos;
              if (digitos.length === 6 && !enviando) formulario.current?.requestSubmit();
            }}
          />
          <p id="codigo-ajuda" className="text-sm text-muted-foreground">
            6 números. Funciona uma vez só; os reenvios trazem o mesmo código.
          </p>
        </div>
        <Button type="submit" size="touch" disabled={enviando}>
          {enviando && (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          )}
          Confirmar e entrar
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
          key={`${reenvio.espera ?? espera}-${reenvio.aviso ?? reenvio.erro ?? ""}`}
          espera={reenvio.espera ?? espera}
          reenviando={reenviando}
        />
        <p className="text-sm text-muted-foreground">
          Não recebeu? Confira o spam e a aba Promoções. Ainda nada?{" "}
          <Link href="/ajuda" className="font-medium text-primary hover:underline">
            Fale com a gente
          </Link>
        </p>
      </form>
    </div>
  );
}
