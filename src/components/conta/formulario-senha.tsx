"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { trocarSenhaAcao, type EstadoSenha } from "@/app/(cliente)/conta/seguranca/acoes";
import { AvisoSalvo, Campo, propsDeErro } from "@/components/painel/campos";
import { CampoCodigoEmail } from "@/components/conta/campo-codigo-email";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputSenha } from "@/components/ui/input-senha";
import { enviarSemLimpar } from "@/lib/formulario";
import { TAMANHO_MINIMO_SENHA } from "@/lib/regras-senha";

const inicial: EstadoSenha = {};

/**
 * Troca de senha (ou criação, na conta que só entra com o Google) em Senha e segurança. Os
 * campos não se limpam quando algo dá errado; depois de trocar, o formulário volta vazio.
 */
export function FormularioSenha({
  email,
  temSenha,
  pedeCodigo,
}: {
  email: string;
  /** Sem senha (só Google): não pede a senha atual e o botão vira "Criar senha". */
  temSenha: boolean;
  /** Verificação em duas etapas ligada: pede o código do app. */
  pedeCodigo: boolean;
}) {
  const [estado, acao, enviando] = useActionState(trocarSenhaAcao, inicial);
  const erros = estado.erros ?? {};

  return (
    <form
      // Depois do sucesso, uma chave nova remonta os campos vazios.
      key={estado.ok ? `ok-${estado.ok}` : "formulario"}
      onSubmit={enviarSemLimpar(acao)}
      noValidate
      className="flex flex-col gap-5"
    >
      {estado.ok && <AvisoSalvo>{estado.ok}</AvisoSalvo>}
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}
      {estado.reentrarComGoogle && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <p>
            Por segurança, para criar uma senha, entre de novo com o Google. Depois, volte aqui em
            até 10 minutos.
          </p>
          <a
            href="/api/auth/google?proximo=%2Fconta%2Fseguranca"
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-fit" })}
          >
            Entrar de novo com o Google
          </a>
        </div>
      )}

      {/* Diz aos gerenciadores de senha de qual conta é a senha nova. */}
      <input type="text" name="usuario" autoComplete="username" value={email} readOnly hidden />
      {temSenha && (
        <CampoSenha
          id="senhaAtual"
          rotulo="Senha atual"
          autoComplete="current-password"
          erro={erros.senhaAtual}
        />
      )}
      <CampoSenha
        id="novaSenha"
        rotulo={temSenha ? "Nova senha" : "Senha"}
        autoComplete="new-password"
        erro={erros.novaSenha}
        ajuda={`Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres${temSenha ? ", diferente da atual" : ""}.`}
      />
      <CampoSenha
        id="confirmacao"
        rotulo={temSenha ? "Repita a nova senha" : "Repita a senha"}
        autoComplete="new-password"
        erro={erros.confirmacao}
      />
      {pedeCodigo && (
        // Verificação em duas etapas ligada: a troca pede o código enviado ao e-mail.
        <CampoCodigoEmail
          finalidade="senha"
          id="codigoMfa"
          name="codigoMfa"
          erro={erros.codigoMfa}
        />
      )}

      <Button type="submit" size="touch" disabled={enviando} className="w-full sm:w-fit">
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        ) : (
          <KeyRound aria-hidden="true" data-icon="inline-start" />
        )}
        {temSenha ? "Trocar senha" : "Criar senha"}
      </Button>
    </form>
  );
}

export function CampoSenha({
  id,
  rotulo,
  autoComplete,
  erro,
  ajuda,
}: {
  id: string;
  rotulo: string;
  autoComplete: "current-password" | "new-password";
  erro?: string;
  ajuda?: string;
}) {
  return (
    <Campo rotulo={rotulo} id={id} erro={erro} ajuda={ajuda}>
      <InputSenha
        {...propsDeErro(id, erro)}
        name={id}
        nome={rotulo.toLowerCase()}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={200}
      />
    </Campo>
  );
}
