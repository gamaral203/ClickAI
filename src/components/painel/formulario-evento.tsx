"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  salvarEventoAcao,
  type CampoEvento,
  type EstadoEvento,
} from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UFS } from "@/lib/ufs";

export type ValoresEvento = {
  titulo: string;
  categoriaId: string;
  inicioEm: string;
  fimEm: string;
  local: string;
  cidade: string;
  estado: string;
  precoFoto: string;
  precoVideo: string;
  visibilidade: "publico" | "nao_listado" | "senha";
  temSenha: boolean;
  fotosSoAposBusca: boolean;
  liberacao: "automatica" | "manual" | "agendada";
  liberadoEm: string;
  filtroHorario: boolean;
  listarNaoIdentificadas: boolean;
  ordenacao: "envio" | "captura" | "nome_arquivo" | "aleatoria";
};

const estadoInicial: EstadoEvento = {};
const classeSelect =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

export function FormularioEvento({
  eventoId,
  categorias,
  inicial,
}: {
  eventoId?: string;
  categorias: { id: string; nome: string }[];
  inicial: ValoresEvento;
}) {
  const [estado, acao, enviando] = useActionState(salvarEventoAcao, estadoInicial);
  const [visibilidade, setVisibilidade] = useState(inicial.visibilidade);
  const [liberacao, setLiberacao] = useState(inicial.liberacao);
  const erros = estado.erros ?? {};
  const props = (id: CampoEvento) => ({
    id,
    name: id,
    "aria-invalid": Boolean(erros[id]),
    "aria-describedby": erros[id] ? `${id}-erro` : undefined,
  });

  return (
    <form action={acao} noValidate className="flex flex-col gap-8">
      {eventoId && <input type="hidden" name="eventoId" value={eventoId} />}
      {estado.ok && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Evento salvo.
        </p>
      )}

      <Secao titulo="Sobre o evento">
        <Campo rotulo="Nome do evento" id="titulo" erro={erros.titulo}>
          <Input
            {...props("titulo")}
            defaultValue={inicial.titulo}
            maxLength={120}
            className="h-11"
          />
        </Campo>
        <Campo rotulo="Categoria" id="categoriaId" erro={erros.categoriaId}>
          <select
            {...props("categoriaId")}
            defaultValue={inicial.categoriaId}
            className={classeSelect}
          >
            <option value="">Escolha</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Início" id="inicioEm" erro={erros.inicioEm}>
            <Input
              {...props("inicioEm")}
              type="datetime-local"
              defaultValue={inicial.inicioEm}
              className="h-11"
            />
          </Campo>
          <Campo rotulo="Fim" id="fimEm" erro={erros.fimEm}>
            <Input
              {...props("fimEm")}
              type="datetime-local"
              defaultValue={inicial.fimEm}
              className="h-11"
            />
          </Campo>
        </div>
        <Campo rotulo="Local" id="local" erro={erros.local}>
          <Input
            {...props("local")}
            defaultValue={inicial.local}
            maxLength={120}
            placeholder="Ex.: Parque Ibirapuera, portão 3"
            className="h-11"
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          <Campo rotulo="Cidade" id="cidade" erro={erros.cidade}>
            <Input
              {...props("cidade")}
              defaultValue={inicial.cidade}
              maxLength={80}
              className="h-11"
            />
          </Campo>
          <Campo rotulo="Estado" id="estado" erro={erros.estado}>
            <select {...props("estado")} defaultValue={inicial.estado} className={classeSelect}>
              <option value="">UF</option>
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Preços">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Preço por foto (R$)" id="precoFoto" erro={erros.precoFoto}>
            <Input
              {...props("precoFoto")}
              inputMode="decimal"
              defaultValue={inicial.precoFoto}
              placeholder="19,90"
              className="h-11"
            />
          </Campo>
          <Campo rotulo="Preço por vídeo (R$)" id="precoVideo" erro={erros.precoVideo}>
            <Input
              {...props("precoVideo")}
              inputMode="decimal"
              defaultValue={inicial.precoVideo}
              placeholder="39,90"
              className="h-11"
            />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Quem vê as fotos">
        <Campo rotulo="Visibilidade" id="visibilidade" erro={erros.visibilidade}>
          <select
            {...props("visibilidade")}
            value={visibilidade}
            onChange={(e) => setVisibilidade(e.target.value as ValoresEvento["visibilidade"])}
            className={classeSelect}
          >
            <option value="publico">Público: aparece na lista de eventos e no Google</option>
            <option value="nao_listado">Não listado: só quem tem o link</option>
            <option value="senha">Com senha: pede a senha para ver as fotos</option>
          </select>
        </Campo>
        {visibilidade === "senha" && (
          <Campo
            rotulo={
              inicial.temSenha
                ? "Nova senha (deixe em branco para manter a atual)"
                : "Senha do evento"
            }
            id="senha"
            erro={erros.senha}
          >
            <Input
              {...props("senha")}
              type="text"
              autoComplete="off"
              maxLength={50}
              className="h-11"
            />
          </Campo>
        )}
        <Opcao nome="fotosSoAposBusca" marcado={inicial.fotosSoAposBusca}>
          Mostrar as fotos só depois da busca por selfie ou número de peito
        </Opcao>
      </Secao>

      <Secao titulo="Quando as fotos aparecem">
        <Campo rotulo="Liberação" id="liberacao" erro={erros.liberacao}>
          <select
            {...props("liberacao")}
            value={liberacao}
            onChange={(e) => setLiberacao(e.target.value as ValoresEvento["liberacao"])}
            className={classeSelect}
          >
            <option value="automatica">Automática: cada foto aparece assim que fica pronta</option>
            <option value="manual">Manual: eu libero quando quiser</option>
            <option value="agendada">Agendada: numa data e hora</option>
          </select>
        </Campo>
        {liberacao === "agendada" && (
          <Campo rotulo="Liberar em (horário de Brasília)" id="liberadoEm" erro={erros.liberadoEm}>
            <Input
              {...props("liberadoEm")}
              type="datetime-local"
              defaultValue={inicial.liberadoEm}
              className="h-11"
            />
          </Campo>
        )}
      </Secao>

      <Secao titulo="Galeria">
        <Campo rotulo="Ordem das fotos" id="ordenacao" erro={erros.ordenacao}>
          <select {...props("ordenacao")} defaultValue={inicial.ordenacao} className={classeSelect}>
            <option value="captura">Horário em que a foto foi tirada</option>
            <option value="envio">Ordem de envio</option>
            <option value="nome_arquivo">Nome do arquivo</option>
            <option value="aleatoria">Aleatória</option>
          </select>
        </Campo>
        <Opcao nome="filtroHorario" marcado={inicial.filtroHorario}>
          Permitir filtrar as fotos por horário
        </Opcao>
        <Opcao nome="listarNaoIdentificadas" marcado={inicial.listarNaoIdentificadas}>
          Mostrar a lista de fotos sem rosto ou número identificado
        </Opcao>
      </Secao>

      <Button type="submit" size="touch" disabled={enviando} className="w-fit">
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        {eventoId ? "Salvar alterações" : "Criar evento"}
      </Button>
    </form>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-lg font-semibold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function Campo({
  rotulo,
  id,
  erro,
  children,
}: {
  rotulo: string;
  id: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro && (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

function Opcao({
  nome,
  marcado,
  children,
}: {
  nome: string;
  marcado: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={marcado}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      {children}
    </label>
  );
}
