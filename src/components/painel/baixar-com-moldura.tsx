"use client";

import { useId, useState, useTransition } from "react";
import { Loader2, Smartphone, Square } from "lucide-react";

import { CampoCodigoEmail } from "@/components/conta/campo-codigo-email";
import { Button } from "@/components/ui/button";
import { linkComMoldura, MEDIDAS_MOLDURA, type FormatoMoldura } from "@/lib/moldura";

import { esquecerLiberacao, liberarEvento } from "./baixar-original";

// "Story" e "Feed": a foto do próprio autor já encaixada na moldura do evento, para ele divulgar
// o evento nas redes ("as fotos já estão disponíveis"). Mesma liberação do "Baixar original"
// (guardada nesta aba, com o código do app se a verificação em duas etapas estiver ligada); o
// servidor confere tudo de novo em /api/painel/original-com-moldura/[fotoId] e compõe a imagem.

const ICONE = { story: Smartphone, feed: Square } as const;

/** Baixa a imagem composta sem sair da página. Devolve a mensagem de erro, ou `null`. */
async function baixar(
  eventoId: string,
  fotoId: string,
  formato: FormatoMoldura,
  token: string,
  nomeArquivo: string,
): Promise<string | null> {
  let resposta: Response;
  try {
    resposta = await fetch(linkComMoldura(fotoId, formato, token), { cache: "no-store" });
  } catch {
    return "Sem conexão. Tente de novo.";
  }
  if (!resposta.ok) {
    // Liberação vencida no servidor: esquece a guardada, para o próximo clique pedir outra.
    if (resposta.status === 403) esquecerLiberacao(eventoId);
    const texto = await resposta.text().catch(() => "");
    return texto.slice(0, 200) || "Não foi possível baixar. Tente de novo.";
  }
  const url = URL.createObjectURL(await resposta.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nomeArquivo.replace(/\.[^.]+$/, "")}-${formato}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}

export function BaixarComMoldura({
  eventoId,
  fotoId,
  nomeArquivo,
  formatos,
}: {
  eventoId: string;
  fotoId: string;
  nomeArquivo: string;
  /** Formatos com moldura cadastrada no evento (sem nenhum, nada aparece). */
  formatos: FormatoMoldura[];
}) {
  const ids = useId();
  const [pedeCodigo, setPedeCodigo] = useState<FormatoMoldura | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<FormatoMoldura | null>(null);
  const [pendente, startTransition] = useTransition();

  if (formatos.length === 0) return null;

  function liberarEBaixar(formato: FormatoMoldura, comCodigo?: string) {
    setErro(null);
    setBaixando(formato);
    startTransition(async () => {
      const liberacao = await liberarEvento(eventoId, comCodigo);
      if (!liberacao.ok) {
        if (liberacao.pedeCodigo) setPedeCodigo(formato);
        if (!liberacao.pedeCodigo || comCodigo) setErro(liberacao.erro);
        return;
      }
      setPedeCodigo(null);
      setCodigo("");
      const falha = await baixar(eventoId, fotoId, formato, liberacao.token, nomeArquivo);
      if (falha) setErro(falha);
    });
  }

  if (pedeCodigo) {
    const formato = pedeCodigo;
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          liberarEBaixar(formato, codigo);
        }}
      >
        <CampoCodigoEmail
          finalidade="originais"
          id={`${ids}-codigo`}
          valor={codigo}
          aoMudar={setCodigo}
          enviarAoMostrar
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
              setPedeCodigo(null);
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
      <p className="text-xs text-muted-foreground">Baixar com moldura</p>
      <div className="flex gap-1.5">
        {formatos.map((formato) => {
          const Icone = ICONE[formato];
          const rotulo = MEDIDAS_MOLDURA[formato].rotulo;
          return (
            <Button
              key={formato}
              variant="outline"
              size="sm"
              disabled={pendente}
              onClick={() => liberarEBaixar(formato)}
              aria-label={`Baixar ${nomeArquivo} com a moldura do evento para ${rotulo.toLowerCase()}`}
              className="flex-1"
            >
              {pendente && baixando === formato ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Icone aria-hidden="true" />
              )}
              {rotulo}
            </Button>
          );
        })}
      </div>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
