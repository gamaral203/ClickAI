"use client";

import { useId, useState, useTransition } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";

import { liberarOriginalDoAutorAcao } from "@/app/(fotografo)/painel/eventos/originais-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// "Baixar original" de uma foto, só nas fotos que o próprio usuário enviou (dono ou
// colaborador). O servidor confere tudo de novo na rota /api/painel/original/[fotoId], que
// devolve a URL assinada do R2 (como anexo): o navegador baixa e a página não sai do lugar.
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

/** Esquece a liberação guardada (o servidor disse que ela venceu). */
export function esquecerLiberacao(eventoId: string) {
  liberacoes.delete(eventoId);
}

export type LiberacaoDoEvento =
  { ok: true; token: string } | { ok: false; erro: string; pedeCodigo: boolean };

/** Liberação do evento: a guardada nesta aba ou uma nova (com o código do app, se o MFA pedir). */
export async function liberarEvento(eventoId: string, codigo?: string): Promise<LiberacaoDoEvento> {
  const guardada = liberacaoGuardada(eventoId);
  if (guardada) return { ok: true, token: guardada };
  const resultado = await liberarOriginalDoAutorAcao(eventoId, codigo).catch(() => null);
  if (!resultado) {
    return {
      ok: false,
      erro: "Não foi possível liberar o download. Tente de novo.",
      pedeCodigo: false,
    };
  }
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro, pedeCodigo: Boolean(resultado.pedeCodigo) };
  }
  liberacoes.set(eventoId, { token: resultado.liberacao, ate: Date.now() + VALIDADE_LOCAL_MS });
  return { ok: true, token: resultado.liberacao };
}

/**
 * Baixa o original de uma foto: pede à rota a URL assinada (em JSON, para o erro aparecer na tela
 * em vez de trocar de página) e abre o link, que o R2 entrega como anexo: o navegador só baixa,
 * sem sair do painel. Devolve a mensagem de erro, ou `null`.
 */
export async function baixarOriginal(
  eventoId: string,
  fotoId: string,
  token: string,
): Promise<string | null> {
  const busca = new URLSearchParams({ liberacao: token, formato: "json" });
  let resposta: Response;
  try {
    resposta = await fetch(`/api/painel/original/${fotoId}?${busca}`, { cache: "no-store" });
  } catch {
    return "Sem conexão. Tente de novo.";
  }
  const dados = (await resposta.json().catch(() => null)) as { url?: string; erro?: string } | null;
  if (!resposta.ok || !dados?.url) {
    // Liberação vencida no servidor: esquece a guardada, para o próximo clique pedir outra.
    if (resposta.status === 403) liberacoes.delete(eventoId);
    return dados?.erro ?? "Não foi possível baixar. Tente de novo.";
  }
  const link = document.createElement("a");
  link.href = dados.url;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return null;
}

export function BaixarOriginal({
  eventoId,
  fotoId,
  nomeArquivo,
  rotulo = "Baixar original",
}: {
  eventoId: string;
  fotoId: string;
  nomeArquivo: string;
  /** Texto do botão (o nome acessível sempre diz que é o original, sem marca d'água). */
  rotulo?: string;
}) {
  const ids = useId();
  const [pedeCodigo, setPedeCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function liberarEBaixar(comCodigo?: string) {
    setErro(null);
    startTransition(async () => {
      const liberacao = await liberarEvento(eventoId, comCodigo);
      if (!liberacao.ok) {
        if (liberacao.pedeCodigo) setPedeCodigo(true);
        // Sem código digitado ainda, o campo aparece sem mensagem de erro.
        if (!liberacao.pedeCodigo || comCodigo) setErro(liberacao.erro);
        return;
      }
      setPedeCodigo(false);
      setCodigo("");
      const falha = await baixarOriginal(eventoId, fotoId, liberacao.token);
      if (falha) setErro(falha);
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
        {rotulo}
      </Button>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
