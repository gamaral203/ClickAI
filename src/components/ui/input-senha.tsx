"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "cn";

import { Input } from "@/components/ui/input";

type PropsInputSenha = Omit<React.ComponentProps<"input">, "type"> & {
  /** Classes do contêiner (largura máxima, margem), para não deformar o campo. */
  classeContainer?: string;
  /**
   * Nome do campo no texto do botão: "Mostrar senha" (padrão) ou, por exemplo, "Mostrar nova
   * senha", para leitor de tela distinguir campos na mesma página.
   */
  nome?: string;
};

/**
 * Campo de senha com botão de olho para mostrar/ocultar o que se digita. Cada campo guarda o
 * próprio estado (mostrar uma senha não revela a de confirmação). Repassa todas as props do input
 * (name, autoComplete, required, ref, aria-*…), menos `type`. O botão tem 44 px de toque e fica
 * dentro do campo, à direita; o texto ganha folga para não ficar por baixo do ícone.
 */
function InputSenha({
  classeContainer,
  className,
  nome = "senha",
  id,
  disabled,
  ...props
}: PropsInputSenha) {
  const [visivel, setVisivel] = React.useState(false);
  const idGerado = React.useId();
  const idDoCampo = id ?? idGerado;

  return (
    <div className={cn("relative w-full", classeContainer)}>
      <Input
        {...props}
        id={idDoCampo}
        type={visivel ? "text" : "password"}
        disabled={disabled}
        className={cn("h-11 pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        disabled={disabled}
        aria-label={visivel ? `Ocultar ${nome}` : `Mostrar ${nome}`}
        aria-pressed={visivel}
        aria-controls={idDoCampo}
        className="absolute inset-y-0 right-0 flex min-h-11 w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {visivel ? (
          <EyeOff aria-hidden="true" className="size-5" />
        ) : (
          <Eye aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  );
}

export { InputSenha };
