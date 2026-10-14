"use client";

import { useActionState } from "react";

import {
  criarContaDemonstracaoAcao,
  type EstadoDemonstracao,
} from "@/app/(admin)/admin/demonstracao/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Formulário da gestão que cria a conta de demonstração. */
export function FormularioDemonstracao() {
  const [estado, acao, enviando] = useActionState<EstadoDemonstracao, FormData>(
    criarContaDemonstracaoAcao,
    {},
  );
  return (
    <form
      action={acao}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:max-w-lg sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="demo-nome">Nome do fotógrafo</Label>
        <Input id="demo-nome" name="nome" defaultValue="Studio Clique Bahia" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="demo-email">E-mail de acesso</Label>
        <Input id="demo-email" name="email" type="email" autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="demo-senha">Senha</Label>
        <Input
          id="demo-senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <Button type="submit" size="touch" disabled={enviando}>
        {enviando ? "Criando…" : "Criar conta de demonstração"}
      </Button>
      {estado.ok && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
