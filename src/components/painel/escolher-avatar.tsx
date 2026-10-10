"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Camera, Check, ChevronDown, Info, Loader2, Trash2 } from "lucide-react";

import { escolherAvatarAcao } from "@/app/(fotografo)/painel/perfil/avatar-acoes";
import { TIPOS_DE_IMAGEM, useImagemDaLoja } from "@/components/painel/usar-imagem-da-loja";
import { Button, buttonVariants } from "@/components/ui/button";
import { AVATARES } from "@/lib/avatares";
import { cn } from "@/lib/utils";

/**
 * Foto de perfil em Perfil e recebimento: o que está em uso (a foto enviada ou o avatar), o envio
 * da foto ali mesmo (o mesmo fluxo de Minha loja) e a grade para escolher um dos avatares. A conta
 * já nasce com um avatar marcado. A foto enviada tem prioridade: com ela, o avatar escolhido fica
 * guardado para quando a foto sair.
 */
export function EscolherAvatar({
  escolhido,
  foto,
}: {
  /** Id do avatar em vigor: o escolhido ou, sem escolha, o padrão da conta. */
  escolhido: string;
  /** URL da foto de perfil enviada, ou `null`. */
  foto: string | null;
}) {
  const router = useRouter();
  const [salvo, setSalvo] = useState(escolhido);
  const [selecionado, selecionar] = useOptimistic(salvo);
  const [salvando, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);

  const envio = useImagemDaLoja("fotoPerfil");

  const avatar = AVATARES.find((a) => a.id === selecionado) ?? AVATARES[0];

  function escolher(id: string) {
    if (id === selecionado) return;
    setMensagem(null);
    iniciar(async () => {
      selecionar(id);
      const resultado = await escolherAvatarAcao(id);
      if (resultado.ok) {
        setSalvo(id);
        setMensagem({ ok: true, texto: "Avatar salvo." });
        router.refresh();
      } else {
        setMensagem({ ok: false, texto: resultado.erro });
      }
    });
  }

  return (
    <section
      aria-labelledby="foto-de-perfil"
      className="flex flex-col gap-6 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <figure className="flex shrink-0 flex-col items-center gap-2">
          <span className="relative size-28 overflow-hidden rounded-full border bg-muted ring-4 ring-accent">
            <Image
              src={foto ?? avatar.url}
              alt={foto ? "Sua foto de perfil" : avatar.nome}
              fill
              sizes="112px"
              className="object-cover"
            />
            {envio.ocupado && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
              </span>
            )}
          </span>
          <figcaption className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {foto ? "Foto enviada" : "Avatar"}
          </figcaption>
        </figure>
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="foto-de-perfil" className="text-lg font-semibold">
              Foto de perfil
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Aparece no painel, no seu link e na sua loja. Envie uma foto sua ou o seu logo, de
              preferência quadrada (JPEG, PNG ou WebP). Sem foto, aparece o avatar.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label
              className={buttonVariants({
                size: "touch",
                className:
                  "h-12 w-full cursor-pointer px-6 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:pointer-events-none has-disabled:opacity-50 sm:w-auto",
              })}
            >
              {envio.ocupado ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <Camera aria-hidden="true" className="size-5" />
              )}
              {foto ? "Enviar outra foto" : "Enviar minha foto"}
              <input
                type="file"
                accept={TIPOS_DE_IMAGEM}
                className="sr-only"
                disabled={envio.ocupado}
                onChange={(e) => {
                  void envio.enviar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {foto && (
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-full sm:w-auto"
                disabled={envio.ocupado}
                onClick={() => void envio.remover()}
              >
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                Remover foto
              </Button>
            )}
          </div>
          {envio.erro && (
            <p role="alert" className="text-sm text-destructive">
              {envio.erro}
            </p>
          )}
        </div>
      </div>

      <details className="group flex flex-col gap-3 border-t pt-4 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Ou use um avatar</span>
            {!foto && (
              <span className="text-sm text-muted-foreground">
                Este é o seu avatar atual. Toque para ver os outros.
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        {foto && (
          <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />A foto enviada tem
            prioridade; remova a foto para voltar a usar o avatar marcado.
          </p>
        )}
        <ul className="grid max-w-2xl grid-cols-4 gap-3 sm:grid-cols-6">
          {AVATARES.map((a) => {
            const marcado = a.id === selecionado;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={marcado}
                  aria-label={a.nome}
                  disabled={salvando}
                  onClick={() => escolher(a.id)}
                  className={cn(
                    "relative block aspect-square w-full rounded-full p-1 transition-[box-shadow,transform] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none enabled:hover:scale-[1.03] disabled:cursor-wait",
                    marcado
                      ? "ring-3 ring-primary"
                      : "ring-1 ring-border enabled:hover:ring-primary/50",
                  )}
                >
                  <span className="relative block size-full overflow-hidden rounded-full">
                    <Image src={a.url} alt="" fill sizes="96px" className="object-cover" />
                  </span>
                  {marcado && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0 bottom-0 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
                    >
                      {salvando ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" strokeWidth={3} />
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p
          role="status"
          className={cn("min-h-5 text-sm", mensagem?.ok ? "text-primary" : "text-destructive")}
        >
          {mensagem?.texto}
        </p>
      </details>
    </section>
  );
}
