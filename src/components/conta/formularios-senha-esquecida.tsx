"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { KeyRound, Loader2, MailCheck } from "lucide-react";

import {
  esqueciSenhaAcao,
  redefinirSenhaAcao,
  type EstadoEsqueci,
  type EstadoNovaSenha,
} from "@/app/(cliente)/entrar/acoes";
import { CampoSenha } from "@/components/conta/formulario-senha";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enviarSemLimpar } from "@/lib/formulario";
import { TAMANHO_MINIMO_SENHA } from "@/lib/regras-senha";

/** "Esqueci a senha": pede o link. A resposta é a mesma exista a conta ou não. */
export function FormularioEsqueciSenha() {
  const [estado, acao, enviando] = useActionState(esqueciSenhaAcao, {} as EstadoEsqueci);

  if (estado.enviado) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MailCheck aria-hidden="true" className="size-6" />
        </span>
        <p>
          Se houver uma conta com <strong className="break-words">{estado.email}</strong>, enviamos
          um link para criar uma nova senha. Ele vale por 30 minutos.
        </p>
        <p className="text-sm text-muted-foreground">
          Não chegou em alguns minutos? Confira o spam e a aba Promoções. Se a conta entra com o
          Google, o e-mail explica como entrar.
        </p>
        <Link href="/entrar" className={buttonVariants({ variant: "outline", size: "touch" })}>
          Voltar para entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Informe o e-mail da sua conta. Vamos mandar um link para você criar uma nova senha.
      </p>
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          defaultValue={estado.email}
          className="h-11"
        />
      </div>
      <Button type="submit" size="touch" disabled={enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Enviar link
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

/** Lê o token do # do endereço e o tira da barra (não fica no histórico nem em capturas de tela). */
function lerTokenDoEndereco(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return token && /^[\w-]{40,60}$/.test(token) ? token : null;
}

/** Senha nova pelo link do e-mail (/entrar/nova-senha#token=…). */
export function FormularioNovaSenha() {
  const [estado, acao, enviando] = useActionState(redefinirSenhaAcao, {} as EstadoNovaSenha);
  // `undefined`: ainda lendo o endereço; `null`: link sem token.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // O # só existe no navegador: o servidor nunca recebe o token pela URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(lerTokenDoEndereco());
  }, []);
  const erros = estado.erros ?? {};

  if (token === undefined) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (token === null || estado.linkInvalido) {
    return (
      <div role="alert" className="flex flex-col gap-4">
        <p>
          Este link de redefinição venceu, já foi usado ou está incompleto. Os links valem por 30
          minutos e funcionam uma vez só.
        </p>
        <Link href="/entrar/esqueci-senha" className={buttonVariants({ size: "touch" })}>
          Pedir um link novo
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-5">
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <CampoSenha
        id="novaSenha"
        rotulo="Nova senha"
        autoComplete="new-password"
        erro={erros.novaSenha}
        ajuda={`Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`}
      />
      <CampoSenha
        id="confirmacao"
        rotulo="Repita a nova senha"
        autoComplete="new-password"
        erro={erros.confirmacao}
      />
      <p className="text-sm text-muted-foreground">
        Ao salvar, todas as sessões abertas da conta são encerradas, inclusive em outros aparelhos.
      </p>
      <Button type="submit" size="touch" disabled={enviando}>
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        ) : (
          <KeyRound aria-hidden="true" data-icon="inline-start" />
        )}
        Salvar nova senha
      </Button>
    </form>
  );
}
