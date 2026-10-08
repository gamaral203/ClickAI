"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { excluirContaAcao, type EstadoExclusao } from "@/app/(cliente)/conta/acoes";
import { Campo, propsDeErro } from "@/components/painel/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enviarSemLimpar } from "@/lib/formulario";

const inicial: EstadoExclusao = {};

/**
 * Confirmação da exclusão: quem tem senha digita a senha; quem só entra com o Google digita o
 * e-mail. Nos dois casos, marca que entendeu que não dá para desfazer.
 */
export function FormularioExclusao({ temSenha, email }: { temSenha: boolean; email: string }) {
  const [estado, acao, enviando] = useActionState(excluirContaAcao, inicial);
  const erros = estado.erros ?? {};

  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-5">
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}

      {temSenha ? (
        <Campo rotulo="Sua senha" id="senha" erro={erros.senha} ajuda="Para confirmar que é você.">
          <Input
            {...propsDeErro("senha", erros.senha)}
            name="senha"
            type="password"
            autoComplete="current-password"
            className="h-11"
          />
        </Campo>
      ) : (
        <Campo
          rotulo="Digite o e-mail da conta"
          id="email"
          erro={erros.email}
          ajuda={`Para confirmar, digite ${email}.`}
        >
          <Input
            {...propsDeErro("email", erros.email)}
            name="email"
            type="email"
            autoComplete="off"
            inputMode="email"
            className="h-11"
          />
        </Campo>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-destructive">
          <input
            type="checkbox"
            name="entendo"
            value="sim"
            aria-invalid={Boolean(erros.entendo)}
            aria-describedby={erros.entendo ? "entendo-erro" : undefined}
            className="mt-1 size-4 accent-destructive"
          />
          <span>Entendo que a exclusão é definitiva e não pode ser desfeita.</span>
        </label>
        {erros.entendo && (
          <p id="entendo-erro" className="text-sm text-destructive">
            {erros.entendo}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="touch"
        disabled={enviando}
        className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-fit"
      >
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        ) : (
          <Trash2 aria-hidden="true" data-icon="inline-start" />
        )}
        Excluir minha conta
      </Button>
    </form>
  );
}
