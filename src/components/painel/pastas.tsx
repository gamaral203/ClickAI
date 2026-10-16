"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  criarPastaAcao,
  excluirPastaAcao,
  moverPastaAcao,
  renomearPastaAcao,
  reordenarPastaAcao,
} from "@/app/(fotografo)/painel/eventos/pastas-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Pasta na ordem da árvore (src/dados/pastas.ts, listarPastasDoPainel). */
export type PastaNaTela = {
  id: string;
  nome: string;
  pastaPaiId: string | null;
  nivel: 1 | 2;
  /** Itens diretamente na pasta. */
  totalItens: number;
  /** Itens da pasta e das subpastas (nível 1). */
  totalComSubpastas: number;
  subpastas: number;
};

type Executar = (acao: () => Promise<{ erro?: string }>, depois?: () => void) => void;

const itens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;
const select =
  "h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto sm:min-w-56";

/**
 * Pastas do evento em árvore: pastas de nível 1 e, recuadas, as subpastas (no máximo 2
 * níveis, ex.: Largada › Bateria 1). Na galeria pública, viram filtros; as fotos de cada pasta
 * são escolhidas no envio, no cartão de cada foto ou em lote, mais abaixo.
 */
export function Pastas({ eventoId, pastas }: { eventoId: string; pastas: PastaNaTela[] }) {
  const router = useRouter();
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, startTransition] = useTransition();
  const raizes = pastas.filter((p) => p.nivel === 1);

  function criar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await criarPastaAcao(eventoId, nova).catch(() => ({
        erro: "Não foi possível criar.",
      }));
      if (resultado.erro) return setErro(resultado.erro);
      setNova("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {pastas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Sem pastas: a galeria mostra todas as fotos juntas.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Até 2 níveis: uma pasta pode ter subpastas (ex.: Largada › Bateria 1), mas uma subpasta
            não tem outra dentro.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Pastas do evento">
            {pastas.map((p) => {
              const irmas = pastas.filter(
                (o) => o.nivel === p.nivel && o.pastaPaiId === p.pastaPaiId,
              );
              const posicao = irmas.findIndex((o) => o.id === p.id);
              return (
                <LinhaPasta
                  key={p.id}
                  eventoId={eventoId}
                  pasta={p}
                  primeira={posicao === 0}
                  ultima={posicao === irmas.length - 1}
                  raizes={raizes}
                  nomeDoPai={raizes.find((r) => r.id === p.pastaPaiId)?.nome}
                />
              );
            })}
          </ul>
        </>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          criar();
        }}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="nova-pasta" className="text-sm font-medium">
            Nova pasta
          </label>
          <Input
            id="nova-pasta"
            value={nova}
            maxLength={60}
            placeholder="Ex.: Chegada"
            onChange={(e) => setNova(e.target.value)}
            aria-invalid={Boolean(erro)}
            className="h-11"
          />
        </div>
        <Button type="submit" variant="outline" size="touch" disabled={criando}>
          {criando ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <FolderPlus aria-hidden="true" data-icon="inline-start" />
          )}
          Criar pasta
        </Button>
      </form>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

type Painel = "renomear" | "subpasta" | "mover" | "excluir" | null;

function LinhaPasta({
  eventoId,
  pasta,
  primeira,
  ultima,
  raizes,
  nomeDoPai,
}: {
  eventoId: string;
  pasta: PastaNaTela;
  primeira: boolean;
  ultima: boolean;
  raizes: PastaNaTela[];
  nomeDoPai?: string;
}) {
  const router = useRouter();
  const [painel, setPainel] = useState<Painel>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const subpasta = pasta.nivel === 2;

  const executar: Executar = (acao, depois) => {
    setErro(null);
    startTransition(async () => {
      const resultado = await acao().catch(() => ({ erro: "Não foi possível concluir." }));
      if (resultado.erro) return setErro(resultado.erro);
      setPainel(null);
      depois?.();
      router.refresh();
    });
  };

  function abrir(qual: Painel) {
    setErro(null);
    setPainel((atual) => (atual === qual ? null : qual));
  }

  const resumo = subpasta
    ? itens(pasta.totalItens)
    : pasta.subpastas > 0
      ? `${itens(pasta.totalComSubpastas)} · ${pasta.subpastas} ${pasta.subpastas === 1 ? "subpasta" : "subpastas"}`
      : itens(pasta.totalItens);

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        subpasta && "ml-5 border-dashed sm:ml-8",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {subpasta ? (
          <CornerDownRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Folder aria-hidden="true" className="size-4 shrink-0 text-primary" />
        )}
        <span className="min-w-0 flex-1 font-medium break-words">
          {subpasta && nomeDoPai && (
            <span className="sr-only">
              {nomeDoPai}
              {" › "}
            </span>
          )}
          {pasta.nome} <span className="text-sm font-normal text-muted-foreground">({resumo})</span>
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Subir ${pasta.nome}`}
            disabled={primeira || pendente}
            onClick={() => executar(() => reordenarPastaAcao(pasta.id, "subir"))}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Descer ${pasta.nome}`}
            disabled={ultima || pendente}
            onClick={() => executar(() => reordenarPastaAcao(pasta.id, "descer"))}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Renomear ${pasta.nome}`}
            aria-expanded={painel === "renomear"}
            onClick={() => abrir("renomear")}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Mover ${pasta.nome}`}
            aria-expanded={painel === "mover"}
            onClick={() => abrir("mover")}
          >
            <FolderInput aria-hidden="true" />
          </Button>
          {!subpasta && (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Nova subpasta em ${pasta.nome}`}
              aria-expanded={painel === "subpasta"}
              onClick={() => abrir("subpasta")}
            >
              <FolderPlus aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Excluir ${pasta.nome}`}
            aria-expanded={painel === "excluir"}
            onClick={() => abrir("excluir")}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      {painel === "renomear" && (
        <FormularioNome
          rotulo="Nome da pasta"
          inicial={pasta.nome}
          botao="Salvar"
          pendente={pendente}
          aoEnviar={(nome) => executar(() => renomearPastaAcao(pasta.id, nome))}
          aoCancelar={() => setPainel(null)}
        />
      )}
      {painel === "subpasta" && (
        <FormularioNome
          rotulo={`Nova subpasta em ${pasta.nome}`}
          inicial=""
          placeholder="Ex.: Bateria 1"
          botao="Criar subpasta"
          pendente={pendente}
          aoEnviar={(nome) => executar(() => criarPastaAcao(eventoId, nome, pasta.id))}
          aoCancelar={() => setPainel(null)}
        />
      )}
      {painel === "mover" && (
        <MoverPasta pasta={pasta} raizes={raizes} pendente={pendente} executar={executar} />
      )}
      {painel === "excluir" && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/60 p-3 text-sm">
          <p>
            {pasta.subpastas > 0 ? (
              <>
                Excluir <strong>{pasta.nome}</strong> e as {pasta.subpastas}{" "}
                {pasta.subpastas === 1 ? "subpasta" : "subpastas"} dela?{" "}
              </>
            ) : (
              <>
                Excluir <strong>{pasta.nome}</strong>?{" "}
              </>
            )}
            {pasta.totalComSubpastas > 0
              ? `${pasta.totalComSubpastas === 1 ? "O item continua" : `Os ${pasta.totalComSubpastas} itens continuam`} no evento, sem pasta.`
              : "Ela está vazia."}{" "}
            Nenhuma foto é apagada.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="touch"
              disabled={pendente}
              onClick={() => executar(() => excluirPastaAcao(pasta.id))}
            >
              {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
              Excluir
            </Button>
            <Button variant="ghost" size="touch" onClick={() => setPainel(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </li>
  );
}

function FormularioNome({
  rotulo,
  inicial,
  placeholder,
  botao,
  pendente,
  aoEnviar,
  aoCancelar,
}: {
  rotulo: string;
  inicial: string;
  placeholder?: string;
  botao: string;
  pendente: boolean;
  aoEnviar: (nome: string) => void;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar(nome);
      }}
    >
      <Input
        aria-label={rotulo}
        value={nome}
        maxLength={60}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setNome(e.target.value)}
        className="h-11 min-w-40 flex-1"
      />
      <Button type="submit" size="touch" disabled={pendente}>
        {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
        {botao}
      </Button>
      <Button type="button" variant="ghost" size="touch" onClick={aoCancelar}>
        Cancelar
      </Button>
    </form>
  );
}

/**
 * Mover a pasta: para o nível 1 ou para dentro de outra pasta de nível 1. Pasta com subpastas
 * não vira subpasta (seriam 3 níveis); o servidor confere de novo.
 */
function MoverPasta({
  pasta,
  raizes,
  pendente,
  executar,
}: {
  pasta: PastaNaTela;
  raizes: PastaNaTela[];
  pendente: boolean;
  executar: Executar;
}) {
  const destinos = raizes.filter((r) => r.id !== pasta.id && r.id !== pasta.pastaPaiId);
  const opcoes = [
    ...(pasta.nivel === 2 ? [{ valor: "", rotulo: "Pasta principal (nível 1)" }] : []),
    ...(pasta.subpastas === 0
      ? destinos.map((r) => ({ valor: r.id, rotulo: `Dentro de ${r.nome}` }))
      : []),
  ];
  const [destino, setDestino] = useState(opcoes[0]?.valor ?? null);

  if (opcoes.length === 0) {
    return (
      <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
        {pasta.subpastas > 0
          ? "Esta pasta tem subpastas e por isso não pode ir para dentro de outra (no máximo 2 níveis). Mova ou exclua as subpastas antes."
          : "Crie outra pasta para poder mover esta para dentro dela."}
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (destino !== null) executar(() => moverPastaAcao(pasta.id, destino || null));
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <label htmlFor={`mover-${pasta.id}`} className="text-sm font-medium">
          Mover {pasta.nome} para
        </label>
        <select
          id={`mover-${pasta.id}`}
          value={destino ?? ""}
          onChange={(e) => setDestino(e.target.value)}
          className={select}
        >
          {opcoes.map((o) => (
            <option key={o.valor || "raiz"} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="touch" disabled={pendente}>
        {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
        Mover
      </Button>
    </form>
  );
}
