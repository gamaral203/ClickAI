"use client";

import { useId, useState, useTransition } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";

import { liberarOriginalDoAutorAcao } from "@/app/(fotografo)/painel/eventos/originais-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// "Baixar original" de uma foto, só nas fotos que o próprio usuário enviou (dono ou
// colaborador). O servidor confere tudo de novo na rota /api/painel/original/[fotoId], que
// responde 302 para a URL assinada do R2 (como anexo): a página não sai do lugar.
//
// A liberação do evento (token assinado de 3 horas, com o código da verificação em duas etapas
// se ligada) fica guardada só na memória desta aba, para o código ser pedido uma vez por evento.

/** Margem para não usar uma liberação perto de vencer (ela vale 3 horas no servidor). */
const VALIDADE_LOCAL_MS = 2.5 * 60 * 60 * 1000;
const liberacoes = new Map<string, { token: string; ate: number }>();

function liberacaoGuardada(eventoId: string) {
  const guardada = liberacoes.get(eventoId);
  if (!guardada || guardada.ate < Date.now()) return null;
  return guardada.token;
}

function baixar(fotoId: string, token: string) {
  // Link comum (não é uma página do app): o 302 leva ao R2, que responde como anexo, e o
  // navegador só baixa, sem sair do painel.
  const busca = new URLSearchParams({ liberacao: token });
  const link = document.createElement("a");
  link.href = `/api/painel/original/${fotoId}?${busca}`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function BaixarOriginal({
  eventoId,
  fotoId,
  nomeArquivo,
}: {
  eventoId: string;
  fotoId: string;
  nomeArquivo: string;
}) {
  const ids = useId();
  const [pedeCodigo, setPedeCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function liberarEBaixar(comCodigo?: string) {
    setErro(null);
    const guardada = liberacaoGuardada(eventoId);
    if (guardada) return baixar(fotoId, guardada);
    startTransition(async () => {
      const resultado = await liberarOriginalDoAutorAcao(eventoId, comCodigo).catch(() => ({
        ok: false as const,
        erro: "Não foi possível liberar o download. Tente de novo.",
        pedeCodigo: undefined,
      }));
      if (!resultado.ok) {
        if (resultado.pedeCodigo) setPedeCodigo(true);
        // Sem código digitado ainda, o campo aparece sem mensagem de erro.
        if (!resultado.pedeCodigo || comCodigo) setErro(resultado.erro);
        return;
      }
      liberacoes.set(eventoId, { token: resultado.liberacao, ate: Date.now() + VALIDADE_LOCAL_MS });
      setPedeCodigo(false);
      setCodigo("");
      baixar(fotoId, resultado.liberacao);
    });
  }

  if (pedeCodigo) {
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          liberarEBaixar(codigo);
        }}
      >
        <label htmlFor={`${ids}-codigo`} className="flex items-center gap-1.5 text-xs font-medium">
          <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
          Código do app autenticador
        </label>
        <Input
          id={`${ids}-codigo`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={40}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          aria-invalid={Boolean(erro)}
          aria-describedby={`${ids}-codigo-ajuda`}
          className="h-9"
        />
        <p id={`${ids}-codigo-ajuda`} className="text-xs text-muted-foreground">
          Libera o download das suas fotos deste evento por 3 horas.
        </p>
        {erro && (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        )}
        <div className="flex gap-1.5">
          <Button type="submit" size="sm" disabled={pendente || !codigo.trim()} className="flex-1">
            {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : "Baixar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPedeCodigo(false);
              setErro(null);
            }}
            className="flex-1"
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() => liberarEBaixar()}
        aria-label={`Baixar o original de ${nomeArquivo}, sem marca d'água`}
      >
        {pendente ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        Baixar original
      </Button>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
