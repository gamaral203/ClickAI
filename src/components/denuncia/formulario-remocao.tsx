"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  pedirRemocaoAcao,
  type CampoRemocao,
  type EstadoRemocao,
} from "@/app/(publico)/remover-foto/acoes";
import { Campo, propsDeErro } from "@/components/painel/campos";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enviarSemLimpar } from "@/lib/formulario";

const inicial: EstadoRemocao = {};

export function FormularioRemocao() {
  const [estado, acao, enviando] = useActionState(pedirRemocaoAcao, inicial);
  const erros = estado.erros ?? {};
  const campo = (nome: CampoRemocao) => ({ ...propsDeErro(nome, erros[nome]), name: nome });

  if (estado.protocolo) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border p-6">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 aria-hidden="true" className="size-6 text-primary" />
          Pedido recebido
        </p>
        <p className="text-muted-foreground">
          Protocolo <strong className="font-mono">{estado.protocolo}</strong>. Mandamos a
          confirmação para o seu e-mail e vamos responder por lá depois da análise.
        </p>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "touch" })}>
          Ir para o início
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-6">
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}

      <Campo
        rotulo="Link da foto ou do evento"
        id="link"
        erro={erros.link}
        ajuda="Abra a foto no site e copie o endereço da barra do navegador. Se forem várias fotos, cole o link do evento."
      >
        <Input
          {...campo("link")}
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…/fotos/…"
          className="h-11"
        />
      </Campo>

      <Campo
        rotulo="Como reconhecemos você"
        id="descricao"
        erro={erros.descricao}
        ajuda="Roupa, número de peito, posição na foto ou horário. Não precisa mandar documento nem selfie."
      >
        <textarea
          {...campo("descricao")}
          rows={5}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Seu e-mail" id="contatoEmail" erro={erros.contatoEmail}>
          <Input {...campo("contatoEmail")} type="email" autoComplete="email" className="h-11" />
        </Campo>
        <Campo rotulo="Telefone (opcional)" id="contatoTelefone" erro={erros.contatoTelefone}>
          <Input {...campo("contatoTelefone")} type="tel" autoComplete="tel" className="h-11" />
        </Campo>
      </div>

      <p className="text-sm text-muted-foreground">
        Usamos seus dados só para analisar e responder o pedido. O fotógrafo não vê seu e-mail nem
        seu telefone.
      </p>

      <Button type="submit" size="touch" className="w-full sm:w-fit" disabled={enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Pedir remoção
      </Button>
    </form>
  );
}
