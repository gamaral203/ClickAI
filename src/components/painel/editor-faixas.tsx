"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { salvarFaixasAcao } from "@/app/(fotografo)/painel/descontos/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AvisoSalvo } from "./campos";

type Faixa = { quantidadeMin: number; descontoPct: number };
type Linha = { chave: number; quantidadeMin: string; descontoPct: string };

const MAXIMO = 5;

/**
 * Faixas de desconto progressivo, em linhas: "a partir de N fotos, X% de desconto". Serve para
 * a regra padrão do fotógrafo (`eventoId` nulo) e para as faixas próprias de um evento.
 */
export function EditorFaixas({
  eventoId,
  inicial,
  semFaixas,
}: {
  eventoId: string | null;
  inicial: Faixa[];
  /** Texto quando não há nenhuma faixa (no evento: o que vale no lugar). */
  semFaixas: string;
}) {
  const router = useRouter();
  const [proxima, setProxima] = useState(inicial.length);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial.map((f, i) => ({
      chave: i,
      quantidadeMin: String(f.quantidadeMin),
      descontoPct: String(f.descontoPct),
    })),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, startTransition] = useTransition();

  function mudar(chave: number, campo: "quantidadeMin" | "descontoPct", valor: string) {
    setSalvo(false);
    setLinhas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  function adicionar() {
    setSalvo(false);
    const ultima = linhas.at(-1);
    setLinhas((atuais) => [
      ...atuais,
      {
        chave: proxima,
        quantidadeMin: String(ultima ? Number(ultima.quantidadeMin) + 3 : 3),
        descontoPct: String(ultima ? Number(ultima.descontoPct) + 10 : 10),
      },
    ]);
    setProxima((n) => n + 1);
  }

  function salvar() {
    setErro(null);
    setSalvo(false);
    const faixas = linhas.map((l) => ({
      quantidadeMin: Number(l.quantidadeMin),
      descontoPct: Number(l.descontoPct),
    }));
    startTransition(async () => {
      const resultado = await salvarFaixasAcao(eventoId, faixas).catch(() => ({
        erro: "Não foi possível salvar. Tente de novo.",
      }));
      if (resultado.erro) return setErro(resultado.erro);
      setSalvo(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {semFaixas}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {linhas.map((linha, i) => (
            <li key={linha.chave} className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`qtd-${eventoId}-${linha.chave}`}>A partir de</label>
              <Input
                id={`qtd-${eventoId}-${linha.chave}`}
                type="number"
                inputMode="numeric"
                min={2}
                max={500}
                value={linha.quantidadeMin}
                onChange={(e) => mudar(linha.chave, "quantidadeMin", e.target.value)}
                className="h-11 w-20"
              />
              <label htmlFor={`pct-${eventoId}-${linha.chave}`}>fotos,</label>
              <Input
                id={`pct-${eventoId}-${linha.chave}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={linha.descontoPct}
                onChange={(e) => mudar(linha.chave, "descontoPct", e.target.value)}
                className="h-11 w-20"
              />
              <span>% de desconto</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Remover a faixa ${i + 1}`}
                onClick={() => {
                  setSalvo(false);
                  setLinhas((atuais) => atuais.filter((l) => l.chave !== linha.chave));
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {salvo && <AvisoSalvo>Faixas salvas. Valem para as próximas compras.</AvisoSalvo>}
      <div className="flex flex-wrap gap-2">
        {linhas.length < MAXIMO && (
          <Button type="button" variant="outline" size="touch" onClick={adicionar}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            Adicionar faixa
          </Button>
        )}
        <Button type="button" size="touch" onClick={salvar} disabled={salvando}>
          {salvando && (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          )}
          Salvar faixas
        </Button>
      </div>
    </div>
  );
}
