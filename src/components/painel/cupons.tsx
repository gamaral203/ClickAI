"use client";

import { useActionState, useState } from "react";
import { Loader2, Pencil, Plus, TicketPercent, X } from "lucide-react";

import {
  salvarCupomAcao,
  type CampoCupom,
  type EstadoCupom,
} from "@/app/(fotografo)/painel/descontos/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AvisoSalvo, Campo, Escolha, propsDeErro } from "./campos";

/** Cupom já com os campos em texto, como o formulário mostra (preparado no servidor). */
export type CupomNoFormulario = {
  id: string;
  codigo: string;
  tipo: "percentual" | "valor" | "fotos_gratis";
  valor: string;
  usosMax: string;
  usos: number;
  inicioEm: string;
  expiraEm: string;
  minimoTipo: "nenhum" | "valor" | "quantidade";
  minimoValor: string;
  todosEventos: boolean;
  eventoIds: string[];
  ativo: boolean;
  /** Resumo para a lista: "10% de desconto", "R$ 5,00 de desconto"… */
  resumo: string;
  situacao: string;
};

type Evento = { id: string; titulo: string };

export function ListaCupons({
  cupons,
  eventos,
  agoraCampo,
}: {
  cupons: CupomNoFormulario[];
  eventos: Evento[];
  /** Data e hora atuais no formato do campo, para o início padrão de um cupom novo. */
  agoraCampo: string;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [versao, setVersao] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      {cupons.length === 0 && !criando && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Você ainda não tem cupons. Crie um para divulgar nas redes ou mandar para clientes.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {cupons.map((cupom) =>
          editando === cupom.id ? (
            <li key={cupom.id} className="rounded-xl border p-4">
              <FormularioCupom
                cupom={cupom}
                eventos={eventos}
                agoraCampo={agoraCampo}
                aoFechar={() => setEditando(null)}
              />
            </li>
          ) : (
            <li key={cupom.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
              <TicketPercent aria-hidden="true" className="size-5 text-primary" />
              <div className="flex flex-1 flex-col">
                <p className="font-mono font-semibold">{cupom.codigo}</p>
                <p className="text-sm text-muted-foreground">
                  {cupom.resumo} · {cupom.situacao}
                </p>
              </div>
              <Button
                variant="outline"
                size="touch"
                onClick={() => {
                  setCriando(false);
                  setEditando(cupom.id);
                }}
              >
                <Pencil aria-hidden="true" data-icon="inline-start" />
                Editar
              </Button>
            </li>
          ),
        )}
      </ul>
      {criando ? (
        <div className="rounded-xl border p-4">
          <FormularioCupom
            key={versao}
            eventos={eventos}
            agoraCampo={agoraCampo}
            aoFechar={() => {
              setCriando(false);
              setVersao((v) => v + 1);
            }}
          />
        </div>
      ) : (
        <Button
          size="touch"
          className="w-fit"
          onClick={() => {
            setEditando(null);
            setCriando(true);
          }}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          Criar cupom
        </Button>
      )}
    </div>
  );
}

const inicial: EstadoCupom = {};

function FormularioCupom({
  cupom,
  eventos,
  agoraCampo,
  aoFechar,
}: {
  cupom?: CupomNoFormulario;
  eventos: Evento[];
  agoraCampo: string;
  aoFechar: () => void;
}) {
  const [estado, acao, salvando] = useActionState(salvarCupomAcao, inicial);
  const [tipo, setTipo] = useState(cupom?.tipo ?? "percentual");
  const [minimoTipo, setMinimoTipo] = useState(cupom?.minimoTipo ?? "nenhum");
  const [todosEventos, setTodosEventos] = useState(cupom?.todosEventos ?? true);
  const erros = estado.erros ?? {};
  const prefixo = cupom?.id ?? "novo";
  const campo = (nome: CampoCupom) => ({
    ...propsDeErro(`${prefixo}-${nome}`, erros[nome]),
    name: nome,
  });

  if (estado.ok && !cupom) {
    return (
      <div className="flex flex-col gap-3">
        <AvisoSalvo>Cupom criado. Ele já vale no checkout.</AvisoSalvo>
        <Button variant="outline" size="touch" className="w-fit" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
    );
  }

  const rotuloValor = {
    percentual: "Desconto (%)",
    valor: "Desconto (R$)",
    fotos_gratis: "Quantidade de fotos grátis",
  }[tipo];

  return (
    <form action={acao} noValidate className="flex flex-col gap-5">
      {cupom && <input type="hidden" name="cupomId" value={cupom.id} />}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{cupom ? `Editar ${cupom.codigo}` : "Novo cupom"}</h3>
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Fechar" onClick={aoFechar}>
          <X aria-hidden="true" />
        </Button>
      </div>
      {estado.ok && <AvisoSalvo>Cupom salvo.</AvisoSalvo>}

      <Campo
        rotulo="Código"
        id={`${prefixo}-codigo`}
        erro={erros.codigo}
        ajuda="O que o cliente digita no checkout. Letras e números, sem espaço."
      >
        <Input
          {...campo("codigo")}
          defaultValue={cupom?.codigo}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          className="h-11 font-mono uppercase"
        />
      </Campo>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo de desconto</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Escolha
            nome="tipo"
            valor="percentual"
            marcado={tipo === "percentual"}
            titulo="Percentual"
            aoMudar={() => setTipo("percentual")}
          />
          <Escolha
            nome="tipo"
            valor="valor"
            marcado={tipo === "valor"}
            titulo="Valor em reais"
            aoMudar={() => setTipo("valor")}
          />
          <Escolha
            nome="tipo"
            valor="fotos_gratis"
            marcado={tipo === "fotos_gratis"}
            titulo="Fotos grátis"
            descricao="As mais baratas saem de graça"
            aoMudar={() => setTipo("fotos_gratis")}
          />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo={rotuloValor} id={`${prefixo}-valor`} erro={erros.valor}>
          <Input
            {...campo("valor")}
            defaultValue={cupom?.valor}
            inputMode={tipo === "valor" ? "decimal" : "numeric"}
            placeholder={tipo === "valor" ? "5,00" : tipo === "percentual" ? "10" : "1"}
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="Limite de usos (opcional)"
          id={`${prefixo}-usosMax`}
          erro={erros.usosMax}
          ajuda={
            cupom
              ? `Usado ${cupom.usos} ${cupom.usos === 1 ? "vez" : "vezes"} até agora.`
              : "Em branco: sem limite."
          }
        >
          <Input
            {...campo("usosMax")}
            defaultValue={cupom?.usosMax}
            inputMode="numeric"
            className="h-11"
          />
        </Campo>
        <Campo rotulo="Vale a partir de" id={`${prefixo}-inicioEm`} erro={erros.inicioEm}>
          <Input
            {...campo("inicioEm")}
            type="datetime-local"
            defaultValue={cupom?.inicioEm ?? agoraCampo}
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="Vale até (opcional)"
          id={`${prefixo}-expiraEm`}
          erro={erros.expiraEm}
          ajuda="Em branco: não vence."
        >
          <Input
            {...campo("expiraEm")}
            type="datetime-local"
            defaultValue={cupom?.expiraEm}
            className="h-11"
          />
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Compra mínima</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Escolha
            nome="minimoTipo"
            valor="nenhum"
            marcado={minimoTipo === "nenhum"}
            titulo="Sem mínimo"
            aoMudar={() => setMinimoTipo("nenhum")}
          />
          <Escolha
            nome="minimoTipo"
            valor="valor"
            marcado={minimoTipo === "valor"}
            titulo="Valor mínimo"
            aoMudar={() => setMinimoTipo("valor")}
          />
          <Escolha
            nome="minimoTipo"
            valor="quantidade"
            marcado={minimoTipo === "quantidade"}
            titulo="Quantidade mínima"
            aoMudar={() => setMinimoTipo("quantidade")}
          />
        </div>
        {minimoTipo !== "nenhum" && (
          <Campo
            rotulo={minimoTipo === "valor" ? "Valor mínimo (R$)" : "Quantidade mínima de itens"}
            id={`${prefixo}-minimoValor`}
            erro={erros.minimoValor}
            ajuda="Conta só os itens dos seus eventos em que o cupom vale."
          >
            <Input
              {...campo("minimoValor")}
              defaultValue={cupom?.minimoValor}
              inputMode={minimoTipo === "valor" ? "decimal" : "numeric"}
              className="h-11 sm:w-48"
            />
          </Campo>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Onde vale</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Escolha
            nome="todosEventos"
            valor="sim"
            marcado={todosEventos}
            titulo="Em todos os meus eventos"
            aoMudar={() => setTodosEventos(true)}
          />
          <Escolha
            nome="todosEventos"
            valor="nao"
            marcado={!todosEventos}
            titulo="Só em alguns eventos"
            aoMudar={() => setTodosEventos(false)}
          />
        </div>
        {!todosEventos && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            {eventos.map((e) => (
              <label key={e.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="eventoIds"
                  value={e.id}
                  defaultChecked={cupom?.eventoIds.includes(e.id)}
                  className="size-5 accent-primary"
                />
                {e.titulo}
              </label>
            ))}
            {erros.eventoIds && <p className="text-sm text-destructive">{erros.eventoIds}</p>}
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={cupom?.ativo ?? true}
          className="size-5 accent-primary"
        />
        Cupom ativo (desmarque para pausar sem apagar)
      </label>

      <Button type="submit" size="touch" className="w-fit" disabled={salvando}>
        {salvando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        {cupom ? "Salvar cupom" : "Criar cupom"}
      </Button>
    </form>
  );
}
