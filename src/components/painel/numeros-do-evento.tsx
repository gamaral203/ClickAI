"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Hash, Loader2, Plus, X } from "lucide-react";

import {
  corrigirNumeroAcao,
  lerNumerosDoEventoAcao,
} from "@/app/(fotografo)/painel/eventos/numeros-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUSTO_DETECT_TEXT_POR_IMAGEM_USD, formatarDolares } from "@/lib/custo-reconhecimento";

const inteiro = new Intl.NumberFormat("pt-BR");

/**
 * Situação da leitura do número de peito no evento ("312 de 1.200 fotos com número") e o botão
 * que lê, em lotes, as fotos que ainda não passaram pela leitura. A correção de cada foto fica
 * na grade de fotos (NumerosDaFoto).
 */
export function NumerosDoEvento({
  eventoId,
  ligada,
  prontas,
  comNumero,
  pendentes,
  configurado,
}: {
  eventoId: string;
  ligada: boolean;
  prontas: number;
  comNumero: number;
  pendentes: number;
  /** Rekognition (ou o modo simulado, fora da produção) disponível no servidor. */
  configurado: boolean;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [falhas, setFalhas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [terminou, setTerminou] = useState(false);

  async function ler() {
    setRodando(true);
    setErro(null);
    setTerminou(false);
    setFeitas(0);
    setFalhas(0);
    let depoisDe: string | null = null;
    try {
      do {
        const r = await lerNumerosDoEventoAcao(eventoId, depoisDe);
        if (!r.ok) {
          setErro(r.erro);
          router.refresh();
          return;
        }
        setFeitas((n) => n + r.lidas);
        setFalhas((n) => n + r.falhas);
        depoisDe = r.proximo;
      } while (depoisDe);
      setTerminou(true);
      router.refresh();
    } catch {
      setErro("A conexão caiu. Clique em “Ler números que faltam” para continuar.");
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 font-medium">
        <Hash aria-hidden="true" className="size-5 text-primary" />
        Número de peito
      </p>
      {!ligada ? (
        <p className="text-sm text-muted-foreground">
          A leitura do número de peito está desligada neste evento
          {comNumero > 0 ? ", mas os números já lidos continuam na busca" : ""}. Para os clientes
          acharem as fotos pelo número, ligue “Ler número de peito nas fotos” em{" "}
          <Link href="?secao=configuracoes" className="font-medium text-primary hover:underline">
            Configurações
          </Link>
          .
        </p>
      ) : !configurado ? (
        <p className="text-sm text-muted-foreground">
          A leitura não está configurada neste servidor (faltam as variáveis REKOGNITION_*). Você
          ainda pode pôr os números à mão em cada foto.
        </p>
      ) : (
        <>
          <p className="text-sm" aria-live="polite">
            <strong className="tabular-nums">{inteiro.format(comNumero)}</strong> de{" "}
            <strong className="tabular-nums">{inteiro.format(prontas)}</strong>{" "}
            {prontas === 1 ? "foto" : "fotos"} com número
            {pendentes > 0 && (
              <span className="text-muted-foreground">
                ; {inteiro.format(pendentes)}{" "}
                {pendentes === 1 ? "ainda não passou" : "ainda não passaram"} pela leitura
              </span>
            )}
            .
          </p>
          <p className="text-sm text-muted-foreground">
            Fotos sem peito à mostra (de costas, de longe) ficam sem número; corrija à mão em cada
            foto, na aba Fotos. As que faltarem também são lidas automaticamente, de tempos em
            tempos.
          </p>
          {pendentes > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="touch" disabled={rodando} onClick={ler}>
                {rodando && (
                  <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
                )}
                {rodando ? `Lendo… ${feitas} fotos` : "Ler números que faltam"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Custo estimado: {formatarDolares(pendentes * CUSTO_DETECT_TEXT_POR_IMAGEM_USD)} no
                Amazon Rekognition
              </span>
            </div>
          )}
          {terminou && !rodando && (
            <p role="status" className="text-sm text-primary">
              Pronto: {feitas} {feitas === 1 ? "foto lida" : "fotos lidas"}.
              {falhas > 0 &&
                ` ${falhas} não ${falhas === 1 ? "pôde" : "puderam"} ser lida${falhas === 1 ? "" : "s"} agora; tente de novo em alguns minutos.`}
            </p>
          )}
        </>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Números de peito de uma foto, com a correção à mão (pôr e tirar). */
export function NumerosDaFoto({
  fotoId,
  nomeArquivo,
  inicial,
}: {
  fotoId: string;
  nomeArquivo: string;
  inicial: string[];
}) {
  const [numeros, setNumeros] = useState(inicial);
  const [visto, setVisto] = useState(inicial);
  if (inicial !== visto) {
    setVisto(inicial);
    setNumeros(inicial);
  }
  const [editando, setEditando] = useState(false);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  function corrigir(acao: "adicionar" | "remover", numero: string) {
    setErro(null);
    startTransition(async () => {
      const r = await corrigirNumeroAcao(fotoId, acao, numero).catch(() => ({
        ok: false as const,
        erro: "Não foi possível salvar.",
      }));
      if (!r.ok) return setErro(r.erro);
      setNumeros(r.numeros);
      if (acao === "adicionar") setNovo("");
    });
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">Nº</span>
        {numeros.length === 0 && <span className="text-muted-foreground">nenhum</span>}
        {numeros.map((n) => (
          <span
            key={n}
            className="flex items-center gap-0.5 rounded-full bg-accent py-0.5 pr-0.5 pl-2 font-medium text-accent-foreground tabular-nums"
          >
            {n}
            {editando && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => corrigir("remover", n)}
                aria-label={`Tirar o número ${n} de ${nomeArquivo}`}
                className="flex size-6 items-center justify-center rounded-full hover:bg-background/60 disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!editando && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditando(true)}
            aria-label={`Corrigir os números de ${nomeArquivo}`}
          >
            Corrigir
          </Button>
        )}
      </div>
      {editando && (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (novo.trim()) corrigir("adicionar", novo);
          }}
        >
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            placeholder="Número"
            aria-label={`Número de peito para pôr em ${nomeArquivo}`}
            className="h-9 w-full"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={salvando || !novo}
            aria-label="Pôr o número"
            className="size-9"
          >
            {salvando ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Plus aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setEditando(false)}
          >
            Fechar
          </Button>
        </form>
      )}
      {erro && (
        <p role="alert" className="text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
