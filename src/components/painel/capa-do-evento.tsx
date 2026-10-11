"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ImageIcon, ImageUp, Loader2, RotateCcw, Star } from "lucide-react";

import { definirCapaAcao, enviarCapaAcao } from "@/app/(fotografo)/painel/eventos/capa-acoes";
import { Button } from "@/components/ui/button";

import type { EscolhaDeCapa } from "./grade-fotos-painel";
import { reduzirImagem, TIPOS_DE_IMAGEM } from "./usar-imagem-da-loja";

/**
 * Grava a capa escolhida (ou `null`, para voltar à automática) e atualiza a página. Usado pela
 * grade de fotos ("Usar como capa") e pelo bloco da capa nas Configurações.
 */
export function useEscolhaDeCapa(eventoId: string, fotoId: string | null) {
  const router = useRouter();
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function gravar(novo: string | null, depois?: () => void) {
    setErro(null);
    setGravando(novo ?? "automatica");
    startTransition(async () => {
      const resultado = await definirCapaAcao({ eventoId, fotoId: novo }).catch(() => ({
        erro: "Não foi possível trocar a capa. Tente de novo.",
      }));
      setGravando(null);
      if (resultado.erro) return setErro(resultado.erro);
      depois?.();
      router.refresh();
    });
  }

  const escolha: EscolhaDeCapa = { fotoId, definir: (id) => gravar(id), gravando };
  return { escolha, gravar, gravando, erro };
}

export type FotoParaCapa = { id: string; urlMiniatura: string; nomeArquivo: string };

/** Lote do seletor: evento com centenas de fotos não monta todas de uma vez. */
const POR_VEZ = 24;

/** A imagem enviada é reduzida no aparelho antes de subir (o servidor regrava em 1200×800). */
const LADO_MAXIMO_ENVIO = 1600;

const SITUACAO = {
  enviada: "Capa enviada por você.",
  escolhida: "Capa escolhida por você (uma foto do evento).",
  automatica: "Capa automática (uma foto liberada do evento, sempre a mesma).",
} as const;

/**
 * Capa do evento nas Configurações: mostra a que vale agora nos cartões (a enviada, a escolhida
 * ou a automática), com "Enviar imagem" (qualquer imagem, como a arte do evento), "Escolher uma
 * foto" (abre as fotos do evento) e "Remover (usar automática)".
 */
export function CapaDoEvento({
  eventoId,
  escolhidaId,
  capaEnviada,
  atual,
  fotos,
}: {
  eventoId: string;
  /** Foto escolhida pelo dono (pode ainda não estar liberada), ou `null`. */
  escolhidaId: string | null;
  /** O dono enviou uma imagem como capa. */
  capaEnviada: boolean;
  /** O que aparece hoje nos cartões; `null`: nenhuma foto liberada ainda. */
  atual: { urlMiniatura: string; origem: keyof typeof SITUACAO } | null;
  /** Fotos que podem virar capa (prontas, não vídeo). */
  fotos: FotoParaCapa[];
}) {
  const router = useRouter();
  const { gravar, gravando, erro } = useEscolhaDeCapa(eventoId, escolhidaId);
  const [abrindo, setAbrindo] = useState(false);
  const [mostrando, setMostrando] = useState(POR_VEZ);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const escolhidaSemValer = escolhidaId !== null && atual?.origem !== "escolhida";
  const ocupado = gravando !== null || enviando;

  async function enviar(escolhido: File | undefined) {
    if (!escolhido) return;
    setErroEnvio(null);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.set("arquivo", await reduzirImagem(escolhido, LADO_MAXIMO_ENVIO), "capa.jpg");
      const resultado = await enviarCapaAcao(eventoId, dados);
      if (resultado.erro) setErroEnvio(resultado.erro);
      else {
        setAbrindo(false);
        router.refresh();
      }
    } catch {
      setErroEnvio("Não conseguimos ler esta imagem. Envie um JPEG, PNG ou WebP.");
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">Capa do evento</h3>
        <p className="text-sm text-muted-foreground">
          A imagem dos cartões do evento na página inicial, na lista de eventos e no seu perfil.
          Envie qualquer imagem (a arte do evento, um cartaz) ou escolha uma foto do evento. A
          imagem enviada aparece como está; a foto do evento sai com a marca d’água. Sem escolha,
          usamos uma foto liberada do evento.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-muted sm:w-48">
          {atual ? (
            <Image src={atual.urlMiniatura} alt="" fill sizes="192px" className="object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageIcon aria-hidden="true" className="size-6" />
              <span className="text-xs">Sem capa ainda</span>
            </div>
          )}
          {enviando && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 aria-hidden="true" className="size-6 animate-spin" />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm" role="status">
            {atual
              ? SITUACAO[atual.origem]
              : "Envie uma imagem, ou espere a primeira foto ser liberada."}
            {escolhidaSemValer && !capaEnviada && (
              <span className="block text-muted-foreground">
                A foto que você escolheu ainda não foi liberada; enquanto isso, vale a automática.
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={arquivo}
              type="file"
              accept={TIPOS_DE_IMAGEM}
              className="sr-only"
              aria-label="Enviar uma imagem para a capa"
              onChange={(e) => void enviar(e.target.files?.[0])}
            />
            <Button size="touch" disabled={ocupado} onClick={() => arquivo.current?.click()}>
              {enviando ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <ImageUp aria-hidden="true" />
              )}
              Enviar imagem
            </Button>
            <Button
              size="touch"
              variant="outline"
              aria-expanded={abrindo}
              aria-controls={`capa-fotos-${eventoId}`}
              disabled={fotos.length === 0 || ocupado}
              onClick={() => setAbrindo((v) => !v)}
            >
              <Star aria-hidden="true" />
              {abrindo ? "Fechar" : "Escolher uma foto"}
            </Button>
            {(escolhidaId || capaEnviada) && (
              <Button size="touch" variant="ghost" disabled={ocupado} onClick={() => gravar(null)}>
                {gravando === "automatica" ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" />
                )}
                Remover (usar automática)
              </Button>
            )}
          </div>
          {fotos.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Envie fotos ao evento para escolher uma delas como capa.
            </p>
          )}
        </div>
      </div>
      {(erro || erroEnvio) && (
        <p role="alert" className="text-sm text-destructive">
          {erro ?? erroEnvio}
        </p>
      )}
      {abrindo && (
        <div id={`capa-fotos-${eventoId}`} className="flex flex-col items-center gap-3">
          <ul className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {fotos.slice(0, mostrando).map((foto) => {
              const ehEscolhida = foto.id === escolhidaId;
              return (
                <li key={foto.id}>
                  <button
                    type="button"
                    disabled={ocupado}
                    aria-pressed={ehEscolhida}
                    aria-label={`Usar ${foto.nomeArquivo} como capa`}
                    onClick={() => gravar(foto.id, () => setAbrindo(false))}
                    className="relative block aspect-square w-full overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-pressed:ring-3 aria-pressed:ring-primary"
                  >
                    <Image
                      src={foto.urlMiniatura}
                      alt=""
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                    {ehEscolhida && (
                      <span className="absolute top-1 left-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        Capa
                      </span>
                    )}
                    {gravando === foto.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {fotos.length > mostrando && (
            <Button variant="outline" size="touch" onClick={() => setMostrando((n) => n + POR_VEZ)}>
              Mostrar mais {Math.min(POR_VEZ, fotos.length - mostrando)} de{" "}
              {fotos.length - mostrando}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
