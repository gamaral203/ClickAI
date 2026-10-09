"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { confirmarCodigoLoginAcao, type EstadoCodigoLogin } from "@/app/(cliente)/conta/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoCodigoLogin = {};

export function FormularioCodigoLogin() {
  const [estado, acao, enviando] = useActionState(confirmarCodigoLoginAcao, inicial);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Abra o app autenticador (Google Authenticator, Authy…) e digite o código de 6 dígitos do
        ClicouAí. Sem o celular, use um dos códigos de recuperação.
      </p>
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="codigo">Código</Label>
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
      </div>
      <Button type="submit" size="touch" disabled={enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Confirmar e entrar
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Perdeu o celular e os códigos?{" "}
        <Link href="/ajuda" className="font-medium text-primary hover:underline">
          Fale com a gente
        </Link>
      </p>
    </form>
  );
}
