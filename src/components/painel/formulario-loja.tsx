"use client";

import { useActionState, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import {
  salvarLojaAcao,
  type CampoLoja,
  type EstadoLoja,
} from "@/app/(fotografo)/painel/loja/acoes";
import { enviarSemLimpar } from "@/lib/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contraste, corDoTexto } from "@/lib/loja";

import { AvisoSalvo, Campo, propsDeErro } from "./campos";

export type LojaNoFormulario = {
  nome: string;
  descricao: string;
  subdominio: string;
  corPrimaria: string;
  corSecundaria: string;
  gaId: string;
  gtmId: string;
  ativa: boolean;
};

const inicial: EstadoLoja = {};

export function FormularioLoja({
  loja,
  enderecoBase,
  enderecoAtual,
}: {
  loja: LojaNoFormulario;
  /** Domínio da plataforma, para mostrar o endereço da loja enquanto digita. */
  enderecoBase: { protocolo: string; host: string };
  /** Endereço da loja salva, se já existe e está ativa. */
  enderecoAtual: string | null;
}) {
  const [estado, acao, salvando] = useActionState(salvarLojaAcao, inicial);
  const [subdominio, setSubdominio] = useState(loja.subdominio);
  const [primaria, setPrimaria] = useState(loja.corPrimaria);
  const [secundaria, setSecundaria] = useState(loja.corSecundaria);
  const erros = estado.erros ?? {};
  const campo = (nome: CampoLoja) => ({ ...propsDeErro(`loja-${nome}`, erros[nome]), name: nome });
  const contrasteBaixo = contraste(primaria, secundaria) < 3;

  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-8">
      {estado.ok && <AvisoSalvo>Loja salva.</AvisoSalvo>}
      {enderecoAtual && (
        <a
          href={enderecoAtual}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Abrir a loja
          <ExternalLink aria-hidden="true" className="size-4" />
        </a>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">Identidade</legend>
        <Campo rotulo="Nome da loja" id="loja-nome" erro={erros.nome}>
          <Input {...campo("nome")} defaultValue={loja.nome} maxLength={80} className="h-11" />
        </Campo>
        <Campo
          rotulo="Descrição (opcional)"
          id="loja-descricao"
          erro={erros.descricao}
          ajuda="Aparece no topo da loja. Até 300 caracteres."
        >
          <textarea
            {...campo("descricao")}
            defaultValue={loja.descricao}
            maxLength={300}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
          />
        </Campo>
        <Campo
          rotulo="Endereço"
          id="loja-subdominio"
          erro={erros.subdominio}
          ajuda={`${enderecoBase.protocolo}//${subdominio || "sua-loja"}.${enderecoBase.host}`}
        >
          <Input
            {...campo("subdominio")}
            value={subdominio}
            onChange={(e) => setSubdominio(e.target.value.toLowerCase())}
            maxLength={32}
            autoCapitalize="none"
            autoComplete="off"
            className="h-11 sm:w-72"
          />
        </Campo>
        <p className="text-sm text-muted-foreground">
          O logo da loja entra junto com o envio de imagens (o mesmo da foto de perfil).
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">Cores</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoCor
            rotulo="Cor principal"
            nome="corPrimaria"
            valor={primaria}
            aoMudar={setPrimaria}
            erro={erros.corPrimaria}
          />
          <CampoCor
            rotulo="Cor de destaque"
            nome="corSecundaria"
            valor={secundaria}
            aoMudar={setSecundaria}
            erro={erros.corSecundaria}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <span
            className="rounded-lg px-4 py-2 font-semibold"
            style={{ backgroundColor: primaria, color: corDoTexto(primaria) }}
          >
            Botão da loja
          </span>
          <span
            className="rounded-lg px-4 py-2 font-semibold"
            style={{ backgroundColor: secundaria, color: corDoTexto(secundaria) }}
          >
            Destaque
          </span>
          <span className="text-sm text-muted-foreground">
            O texto fica branco ou preto, o que for mais legível.
          </span>
        </div>
        {contrasteBaixo && (
          <p className="text-sm text-muted-foreground">
            As duas cores estão parecidas: o destaque pode sumir ao lado da cor principal.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">Medição de visitas (opcional)</legend>
        <p className="text-sm text-muted-foreground">
          Cole só o ID. Por segurança, não aceitamos códigos nem scripts: nós montamos a instalação
          a partir do ID.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Google Analytics" id="loja-gaId" erro={erros.gaId}>
            <Input
              {...campo("gaId")}
              defaultValue={loja.gaId}
              placeholder="G-XXXXXXXXXX"
              maxLength={20}
              autoComplete="off"
              className="h-11 uppercase"
            />
          </Campo>
          <Campo rotulo="Google Tag Manager" id="loja-gtmId" erro={erros.gtmId}>
            <Input
              {...campo("gtmId")}
              defaultValue={loja.gtmId}
              placeholder="GTM-XXXXXXX"
              maxLength={16}
              autoComplete="off"
              className="h-11 uppercase"
            />
          </Campo>
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="ativa"
          defaultChecked={loja.ativa}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        Loja no ar (desmarque para tirar do ar sem perder a configuração)
      </label>

      <Button type="submit" size="touch" className="w-fit" disabled={salvando}>
        {salvando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Salvar loja
      </Button>
    </form>
  );
}

function CampoCor({
  rotulo,
  nome,
  valor,
  aoMudar,
  erro,
}: {
  rotulo: string;
  nome: CampoLoja;
  valor: string;
  aoMudar: (cor: string) => void;
  erro?: string;
}) {
  return (
    <Campo rotulo={rotulo} id={`loja-${nome}`} erro={erro}>
      <div className="flex items-center gap-3">
        <input
          {...propsDeErro(`loja-${nome}`, erro)}
          name={nome}
          type="color"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className="h-11 w-16 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
        <span className="font-mono text-sm uppercase">{valor}</span>
      </div>
    </Campo>
  );
}
