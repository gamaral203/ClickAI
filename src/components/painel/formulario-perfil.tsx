"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  salvarPerfilAcao,
  type CampoPerfil,
  type EstadoPerfil,
} from "@/app/(fotografo)/painel/perfil/acoes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarDataEHora } from "@/lib/formatar";

type Valores = Record<CampoPerfil, string>;

const inicialEstado: EstadoPerfil = {};

export function FormularioPerfil({
  inicial,
  temSenha,
}: {
  inicial: Valores;
  /** A conta tem senha (pede a senha para trocar o CPF/CNPJ); sem senha, pede o Google. */
  temSenha: boolean;
}) {
  const [estado, acao, enviando] = useActionState(salvarPerfilAcao, inicialEstado);
  const erros = estado.erros ?? {};

  return (
    <form action={acao} noValidate className="flex flex-col gap-5">
      {estado.ok && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          {estado.chavePendente
            ? "Perfil salvo. Agora confirme a chave Pix logo abaixo, em “Usar meu CPF/CNPJ como chave Pix”: sem isso, não dá para publicar eventos."
            : "Perfil salvo."}
          {estado.saquesLiberadosEm &&
            ` Como o CPF/CNPJ mudou, os saques ficam bloqueados até ${formatarDataEHora(estado.saquesLiberadosEm)}, mandamos um aviso para o seu e-mail e as outras sessões da conta foram encerradas.`}
        </p>
      )}
      {estado.reentrarComGoogle && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <p>
            Por segurança, para trocar o CPF/CNPJ, entre de novo com o Google. Depois, volte aqui e
            salve em até 10 minutos.
          </p>
          <a
            href="/api/auth/google?proximo=%2Fpainel%2Fperfil"
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-fit" })}
          >
            Entrar de novo com o Google
          </a>
        </div>
      )}
      <Campo
        id="nomePublico"
        rotulo="Nome público"
        valor={inicial.nomePublico}
        erro={erros.nomePublico}
      />
      <Campo
        id="slug"
        rotulo="Endereço do perfil"
        valor={inicial.slug}
        erro={erros.slug}
        ajuda="Letras minúsculas, números e hífens. Ex.: lia-ramos"
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Sobre você</Label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={inicial.bio}
          aria-invalid={Boolean(erros.bio)}
          className="rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
        />
        {erros.bio && <p className="text-sm text-destructive">{erros.bio}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo
          id="instagram"
          rotulo="Instagram"
          valor={inicial.instagram}
          erro={erros.instagram}
          ajuda="Só o usuário, sem o @."
        />
        <Campo
          id="site"
          rotulo="Site"
          tipo="url"
          valor={inicial.site}
          erro={erros.site}
          ajuda="Começando com https://"
        />
      </div>
      <Campo
        id="cpfCnpj"
        rotulo="CPF ou CNPJ"
        valor={inicial.cpfCnpj}
        erro={erros.cpfCnpj}
        modoTeclado="numeric"
        ajuda="Usado só para o repasse das vendas. Não aparece no perfil público. Trocar o CPF/CNPJ bloqueia os saques por 72 horas."
      />
      {temSenha && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="senhaAtual">Senha atual (só para trocar o CPF/CNPJ)</Label>
          <Input
            id="senhaAtual"
            name="senhaAtual"
            type="password"
            autoComplete="current-password"
            maxLength={200}
            aria-invalid={Boolean(erros.senhaAtual)}
            aria-describedby={erros.senhaAtual ? "senhaAtual-erro" : undefined}
            className="h-11"
          />
          {erros.senhaAtual && (
            <p id="senhaAtual-erro" className="text-sm text-destructive">
              {erros.senhaAtual}
            </p>
          )}
        </div>
      )}
      {!temSenha && erros.senhaAtual && (
        <p className="text-sm text-destructive">{erros.senhaAtual}</p>
      )}
      <Button type="submit" size="touch" disabled={enviando} className="w-fit">
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Salvar perfil
      </Button>
    </form>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  erro,
  ajuda,
  tipo = "text",
  modoTeclado,
}: {
  id: CampoPerfil;
  rotulo: string;
  valor: string;
  erro?: string;
  ajuda?: string;
  tipo?: string;
  modoTeclado?: "numeric";
}) {
  const descricao = erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={id}
        type={tipo}
        inputMode={modoTeclado}
        defaultValue={valor}
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
