"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Folder, FolderPlus, Loader2, Pencil, Trash2 } from "lucide-react";

import {
  criarPastaAcao,
  excluirPastaAcao,
  renomearPastaAcao,
} from "@/app/(fotografo)/painel/eventos/pastas-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PastaNaTela = { id: string; nome: string; totalItens: number };

/**
 * Pastas do evento (ex.: Largada, Percurso, Chegada). Na galeria pública, viram filtros; as
 * fotos de cada pasta são escolhidas no cartão de cada foto, mais abaixo.
 */
export function Pastas({ eventoId, pastas }: { eventoId: string; pastas: PastaNaTela[] }) {
  const router = useRouter();
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, startTransition] = useTransition();

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
        <ul className="flex flex-col gap-2">
          {pastas.map((p) => (
            <LinhaPasta key={p.id} pasta={p} />
          ))}
        </ul>
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

function LinhaPasta({ pasta }: { pasta: PastaNaTela }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(pasta.nome);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar(acao: () => Promise<{ erro?: string }>) {
    setErro(null);
    startTransition(async () => {
      const resultado = await acao().catch(() => ({ erro: "Não foi possível concluir." }));
      if (resultado.erro) return setErro(resultado.erro);
      setEditando(false);
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {editando ? (
          <form
            className="flex flex-1 flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              executar(() => renomearPastaAcao(pasta.id, nome));
            }}
          >
            <Input
              aria-label="Nome da pasta"
              value={nome}
              maxLength={60}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              className="h-11 min-w-40 flex-1"
            />
            <Button type="submit" size="touch" disabled={pendente}>
              Salvar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="touch"
              onClick={() => {
                setNome(pasta.nome);
                setEditando(false);
              }}
            >
              Cancelar
            </Button>
          </form>
        ) : (
          <>
            <span className="flex-1 font-medium">
              {pasta.nome}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({pasta.totalItens} {pasta.totalItens === 1 ? "item" : "itens"})
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Renomear ${pasta.nome}`}
              onClick={() => setEditando(true)}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Excluir ${pasta.nome}`}
              onClick={() => setConfirmando(true)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
      {confirmando && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Excluir a pasta? As fotos continuam no evento, sem pasta.</span>
          <Button
            variant="destructive"
            size="sm"
            disabled={pendente}
            onClick={() => executar(() => excluirPastaAcao(pasta.id))}
          >
            Excluir
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
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
