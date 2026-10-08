"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { cadastrarAcao, entrarAcao, type EstadoFormulario } from "@/app/(cliente)/conta/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inicial: EstadoFormulario = {};

export function FormularioEntrar({ proximo }: { proximo?: string }) {
  const [estado, acao, enviando] = useActionState(entrarAcao, inicial);
  return (
    <form action={acao} className="flex flex-col gap-4">
      {proximo && <input type="hidden" name="proximo" value={proximo} />}
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
          defaultValue={estado.valores?.email}
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </div>
      <Button type="submit" size="touch" disabled={enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Entrar
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href={proximo ? `/cadastro?proximo=${encodeURIComponent(proximo)}` : "/cadastro"}
          className="font-medium text-primary hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export function FormularioCadastro({
  papelInicial,
  proximo,
}: {
  papelInicial: "cliente" | "fotografo";
  proximo?: string;
}) {
  const [estado, acao, enviando] = useActionState(cadastrarAcao, inicial);
  const erros = estado.erros ?? {};
  return (
    <form action={acao} noValidate className="flex flex-col gap-4">
      {proximo && <input type="hidden" name="proximo" value={proximo} />}
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Tipo de conta</legend>
        {(
          [
            ["cliente", "Quero comprar fotos", "Encontre e baixe as fotos dos seus eventos."],
            ["fotografo", "Sou fotógrafo", "Publique eventos e venda suas fotos."],
          ] as const
        ).map(([valor, titulo, descricao]) => (
          <label
            key={valor}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-accent"
          >
            <input
              type="radio"
              name="papel"
              value={valor}
              defaultChecked={valor === papelInicial}
              className="mt-1 size-4 accent-primary"
            />
            <span className="flex flex-col">
              <span className="font-medium">{titulo}</span>
              <span className="text-sm text-muted-foreground">{descricao}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <CampoTexto
        id="nome"
        rotulo="Nome completo"
        autoComplete="name"
        valor={estado.valores?.nome}
        erro={erros.nome}
      />
      <CampoTexto
        id="email"
        rotulo="E-mail"
        tipo="email"
        autoComplete="email"
        valor={estado.valores?.email}
        erro={erros.email}
      />
      <CampoTexto
        id="senha"
        rotulo="Senha"
        tipo="password"
        autoComplete="new-password"
        ajuda="Pelo menos 8 caracteres."
        erro={erros.senha}
      />
      <Button type="submit" size="touch" disabled={enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Criar conta
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

function CampoTexto({
  id,
  rotulo,
  tipo = "text",
  autoComplete,
  valor,
  ajuda,
  erro,
}: {
  id: string;
  rotulo: string;
  tipo?: string;
  autoComplete: string;
  valor?: string;
  ajuda?: string;
  erro?: string;
}) {
  const descricao = erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={id}
        type={tipo}
        autoComplete={autoComplete}
        defaultValue={valor}
        required
        aria-invalid={Boolean(erro)}
        aria-describedby={descricao}
        className="h-11"
      />
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      ) : (
        ajuda && (
          <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
            {ajuda}
          </p>
        )
      )}
    </div>
  );
}
