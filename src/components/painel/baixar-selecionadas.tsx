"use client";

import { useId, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { CampoCodigoEmail } from "@/components/conta/campo-codigo-email";
import { Button } from "@/components/ui/button";

import { baixarOriginal, liberarEvento } from "./baixar-original";

export type FotoParaBaixar = { fotoId: string; eventoId: string };

/** Pausa entre um download e o seguinte, para o navegador não descartar nenhum. */
const INTERVALO_MS = 700;

const esperar = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));

/**
 * Baixa várias fotos de uma vez (as selecionadas, ou todas da compra), uma depois da outra, pelo
 * mesmo caminho do "Baixar" de cada foto: a liberação do evento (com o código do app, se o MFA
 * pedir) e a URL assinada de cada original, conferida no servidor foto a foto. Para no primeiro
 * erro e mostra a mensagem; "Continuar" retoma de onde parou, sem baixar de novo o que já foi. O
 * navegador pode perguntar uma vez se o site pode baixar vários arquivos.
 */
export function BaixarSelecionadas({ fotos, rotulo }: { fotos: FotoParaBaixar[]; rotulo: string }) {
  const ids = useId();
  // Já baixadas nesta rodada: o "Continuar" pula; ao terminar, zera.
  const feitas = useRef(new Set<string>());
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedeCodigo, setPedeCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");

  const total = fotos.length;
  const parou = !rodando && erro !== null && progresso > 0;

  async function baixarTodas(comCodigo?: string) {
    setErro(null);
    setAviso(null);
    setRodando(true);
    let codigoDaVez = comCodigo;
    try {
      const faltam = fotos.filter((f) => !feitas.current.has(f.fotoId));
      for (const eventoId of new Set(faltam.map((f) => f.eventoId))) {
        const liberacao = await liberarEvento(eventoId, codigoDaVez);
        if (!liberacao.ok) {
          if (liberacao.pedeCodigo) setPedeCodigo(true);
          // Sem código digitado ainda, o campo aparece sem mensagem de erro.
          if (!liberacao.pedeCodigo || codigoDaVez) setErro(liberacao.erro);
          return;
        }
        codigoDaVez = undefined;
        setPedeCodigo(false);
        setCodigo("");
        for (const foto of faltam.filter((f) => f.eventoId === eventoId)) {
          const falha = await baixarOriginal(eventoId, foto.fotoId, liberacao.token);
          if (falha) {
            setErro(falha);
            return;
          }
          feitas.current.add(foto.fotoId);
          setProgresso(feitas.current.size);
          await esperar(INTERVALO_MS);
        }
      }
      setAviso(total === 1 ? "Foto baixada." : `${total} fotos baixadas.`);
      feitas.current.clear();
      setProgresso(0);
    } finally {
      setRodando(false);
    }
  }

  if (pedeCodigo) {
    return (
      <form
        className="flex w-full flex-col gap-1.5 sm:max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void baixarTodas(codigo);
        }}
      >
        <CampoCodigoEmail
          finalidade="originais"
          id={`${ids}-codigo`}
          valor={codigo}
          aoMudar={setCodigo}
          enviarAoMostrar
        />
        {erro && (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        )}
        <div className="flex gap-1.5">
          <Button type="submit" size="sm" disabled={rodando || !codigo.trim()} className="flex-1">
            {rodando ? <Loader2 aria-hidden="true" className="animate-spin" /> : "Baixar"}
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
      <Button variant="outline" size="sm" disabled={rodando} onClick={() => void baixarTodas()}>
        {rodando ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {rodando
          ? `Baixando ${Math.min(progresso + 1, total)} de ${total}…`
          : parou
            ? `Continuar (${total - progresso} restantes)`
            : rotulo}
      </Button>
      {aviso && (
        <p role="status" className="text-xs text-muted-foreground">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
