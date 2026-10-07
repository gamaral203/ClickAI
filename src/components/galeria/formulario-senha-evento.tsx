"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";

import { entrarNoEvento, type EstadoSenhaEvento } from "@/app/(publico)/eventos/[slug]/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoSenhaEvento = { erro: null };

/** Pede a senha do evento. Quando confere, a página renderiza de novo já com a galeria. */
export function FormularioSenhaEvento({ slug }: { slug: string }) {
  const [estado, acao, enviando] = useActionState(entrarNoEvento, inicial);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Lock aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">Este evento é protegido por senha</h2>
      <p className="max-w-md text-muted-foreground">
        Digite a senha que você recebeu de quem organizou o evento para ver as fotos.
      </p>
      <form action={acao} className="mt-2 flex w-full max-w-sm flex-col gap-3 text-left">
        <input type="hidden" name="slug" value={slug} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="senha-evento">Senha do evento</Label>
          <Input
            id="senha-evento"
            name="senha"
            type="password"
            autoComplete="off"
            required
            maxLength={50}
            aria-invalid={estado.erro ? true : undefined}
            aria-describedby={estado.erro ? "erro-senha-evento" : undefined}
            className="h-11"
          />
        </div>
        {estado.erro && (
          <p id="erro-senha-evento" role="alert" className="text-sm text-destructive">
            {estado.erro}
          </p>
        )}
        <Button type="submit" size="touch" disabled={enviando}>
          {enviando && (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          )}
          Ver as fotos
        </Button>
      </form>
    </div>
  );
}
