"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

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

// Assistente de criação: 3 passos curtos; o resto vem com padrões e fica em "Mais opções".
const PASSOS = ["Sobre o evento", "Local", "Preço"] as const;
const CAMPOS_DO_PASSO: CampoEvento[][] = [
  ["titulo", "categoriaId", "inicioEm", "fimEm"],
  ["local", "cidade", "estado"],
  ["precoFoto", "precoVideo", "visibilidade", "senha", "liberacao", "liberadoEm", "ordenacao"],
];
const NOMES_DOS_CAMPOS: Partial<Record<CampoEvento, string>> = {
  titulo: "o nome do evento",
  categoriaId: "a categoria",
  inicioEm: "o início",
  fimEm: "o fim",
  local: "o local",
  cidade: "a cidade",
  estado: "o estado",
};

/** Passo onde está o primeiro campo com erro devolvido pelo servidor. */
function passoDoErro(erros: Partial<Record<CampoEvento, string>>) {
  const i = CAMPOS_DO_PASSO.findIndex((campos) => campos.some((c) => erros[c]));
  return i < 0 ? null : i;
}
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
  const formulario = useRef<HTMLFormElement>(null);
  // Criar evento usa o assistente em passos; editar mostra tudo de uma vez.
  const assistente = !eventoId;
  const [passo, setPasso] = useState(0);
  const [faltando, setFaltando] = useState<string | null>(null);
  // Quando o servidor devolve erro, o assistente volta para o passo do primeiro campo errado.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    const comErro = passoDoErro(estado.erros ?? {});
    if (assistente && comErro !== null) setPasso(comErro);
  }

  /** Confere os campos obrigatórios do passo antes de seguir (o servidor confere de novo). */
  function continuar() {
    const dados = formulario.current ? new FormData(formulario.current) : null;
    const vazios = CAMPOS_DO_PASSO[passo].filter(
      (c) => NOMES_DOS_CAMPOS[c] && !String(dados?.get(c) ?? "").trim(),
    );
    if (vazios.length > 0) {
      setFaltando(`Preencha ${vazios.map((c) => NOMES_DOS_CAMPOS[c]).join(", ")}.`);
      return;
    }
    setFaltando(null);
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  }
  const visivel = (i: number) => !assistente || passo === i;
  const props = (id: CampoEvento) => ({
    id,
    name: id,
    "aria-invalid": Boolean(erros[id]),
    "aria-describedby": erros[id] ? `${id}-erro` : undefined,
  });

  return (
    <form ref={formulario} action={acao} noValidate className="flex flex-col gap-8">
      {eventoId && <input type="hidden" name="eventoId" value={eventoId} />}
      {assistente && (
        <ol aria-label="Passos" className="flex gap-2">
          {PASSOS.map((nome, i) => (
            <li
              key={nome}
              aria-current={i === passo ? "step" : undefined}
              className="flex flex-1 flex-col gap-1.5 text-xs font-medium sm:text-sm"
            >
              <span className={`h-1.5 rounded-full ${i <= passo ? "bg-primary" : "bg-muted"}`} />
              <span className={i === passo ? "text-foreground" : "text-muted-foreground"}>
                {i + 1}. {nome}
              </span>
            </li>
          ))}
        </ol>
      )}
      {estado.ok && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-accent p-3 text-accent-foreground"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Evento salvo.
        </p>
      )}

      <div hidden={!visivel(0)} className="contents">
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
        </Secao>
      </div>

      <div hidden={!visivel(1)} className="contents">
        <Secao titulo="Local">
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
      </div>

      <div hidden={!visivel(2)} className="contents">
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

        <MaisOpcoes assistente={assistente}>
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
            <p className="text-sm text-muted-foreground">
              É o padrão de cada envio: na hora de enviar, você pode escolher outro para aquele
              lote, e depois liberar, agendar ou cancelar o agendamento na lista de fotos. As fotos
              só aparecem com o evento publicado.
            </p>
            <Campo rotulo="Liberação padrão" id="liberacao" erro={erros.liberacao}>
              <select
                {...props("liberacao")}
                value={liberacao}
                onChange={(e) => setLiberacao(e.target.value as ValoresEvento["liberacao"])}
                className={classeSelect}
              >
                <option value="automatica">
                  Automática: cada foto aparece assim que fica pronta
                </option>
                <option value="manual">
                  Manual: ficam guardadas até eu clicar em Liberar agora
                </option>
                <option value="agendada">Agendada: numa data e hora</option>
              </select>
            </Campo>
            {liberacao === "agendada" && (
              <Campo
                rotulo="Liberar em (horário de Brasília)"
                id="liberadoEm"
                erro={erros.liberadoEm}
              >
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
              <select
                {...props("ordenacao")}
                defaultValue={inicial.ordenacao}
                className={classeSelect}
              >
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
        </MaisOpcoes>
      </div>

      {faltando && (
        <p role="alert" className="text-sm text-destructive">
          {faltando}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {assistente && passo > 0 && (
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => {
              setFaltando(null);
              setPasso((p) => p - 1);
            }}
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Voltar
          </Button>
        )}
        {/* Chaves diferentes: sem elas, o React reaproveitaria o mesmo botão e o clique em
            "Continuar" do penúltimo passo viraria envio do formulário. */}
        {assistente && passo < PASSOS.length - 1 ? (
          <Button key="continuar" type="button" size="touch" onClick={continuar}>
            Continuar
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        ) : (
          <Button key="enviar" type="submit" size="touch" disabled={enviando} className="w-fit">
            {enviando && (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            )}
            {eventoId ? "Salvar alterações" : "Criar evento"}
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * No assistente, as opções avançadas ficam recolhidas (os padrões já servem para a maioria dos
 * eventos); na edição, aparecem abertas como antes.
 */
function MaisOpcoes({ assistente, children }: { assistente: boolean; children: React.ReactNode }) {
  if (!assistente) return <>{children}</>;
  return (
    <details className="group rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">
        Mais opções (opcional): quem vê, quando as fotos aparecem e a galeria
      </summary>
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </details>
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
