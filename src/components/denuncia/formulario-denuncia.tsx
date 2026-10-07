"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  enviarDenunciaAcao,
  type CampoDenuncia,
  type EstadoDenuncia,
} from "@/app/(publico)/denunciar/acoes";
import { Campo, propsDeErro } from "@/components/painel/campos";
import { enviarSemLimpar } from "@/lib/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOTIVOS_DENUNCIA, type MotivoDenuncia } from "@/lib/denuncias";

const inicial: EstadoDenuncia = {};

export function FormularioDenuncia({
  slug,
  fotoId,
  voltarPara,
}: {
  slug: string;
  fotoId: string | null;
  voltarPara: string;
}) {
  const [estado, acao, enviando] = useActionState(enviarDenunciaAcao, inicial);
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const erros = estado.erros ?? {};
  const campo = (nome: CampoDenuncia) => ({ ...propsDeErro(nome, erros[nome]), name: nome });

  if (estado.protocolo) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border p-6">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 aria-hidden="true" className="size-6 text-primary" />
          Denúncia recebida
        </p>
        <p className="text-muted-foreground">
          Protocolo <strong className="font-mono">{estado.protocolo}</strong>. Mandamos a
          confirmação para o seu e-mail e vamos responder por lá depois da análise.
        </p>
        <Link href={voltarPara} className={buttonVariants({ variant: "outline", size: "touch" })}>
          Voltar
        </Link>
      </div>
    );
  }

  const empresa = motivo === "direitos_autorais";

  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="slug" value={slug} />
      {fotoId && <input type="hidden" name="fotoId" value={fotoId} />}
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Motivo</legend>
        {Object.entries(MOTIVOS_DENUNCIA).map(([valor, rotulo]) => (
          <label
            key={valor}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-accent"
          >
            <input
              type="radio"
              name="motivo"
              value={valor}
              onChange={() => setMotivo(valor as MotivoDenuncia)}
              className="mt-1 size-4 accent-primary"
            />
            <span>{rotulo}</span>
          </label>
        ))}
        {erros.motivo && <p className="text-sm text-destructive">{erros.motivo}</p>}
      </fieldset>

      <Campo
        rotulo="O que aconteceu"
        id="descricao"
        erro={erros.descricao}
        ajuda={
          motivo === "privacidade"
            ? "Diga como a gente reconhece você na foto (roupa, número de peito, posição)."
            : "Quanto mais detalhes, mais rápida a análise."
        }
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

      {empresa && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Razão social (se for empresa)" id="razaoSocial" erro={erros.razaoSocial}>
            <Input {...campo("razaoSocial")} className="h-11" />
          </Campo>
          <Campo rotulo="CNPJ (se for empresa)" id="cnpj" erro={erros.cnpj}>
            <Input {...campo("cnpj")} inputMode="numeric" className="h-11" />
          </Campo>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Usamos seus dados só para analisar e responder a denúncia. O fotógrafo não vê seu e-mail nem
        seu telefone.
      </p>

      <Button type="submit" size="touch" className="w-fit" disabled={enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Enviar denúncia
      </Button>
    </form>
  );
}
