"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRef, useState, useSyncExternalStore } from "react";
import { Camera, ImageUp, Loader2, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Celular e tablet abrem a câmera direto pelo campo de arquivo (`capture`). No computador o
 * navegador ignora o `capture` e abriria o mesmo seletor de arquivos, então lá só aparece
 * "Carregar foto".
 */
function useTemCameraNativa() {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia("(pointer: coarse)");
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/**
 * Modal da busca por reconhecimento facial: a pessoa aceita o aviso de uso da selfie e tira
 * uma foto na hora ou escolhe uma da galeria. A imagem não fica guardada aqui: vai direto para
 * `aoEscolher`, e os campos de arquivo são limpos em seguida.
 */
export function DialogoBuscaFacial({
  aberto,
  aoMudarAberto,
  aoEscolher,
  buscando,
  erro,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  aoEscolher: (arquivo: File) => void;
  buscando: boolean;
  erro: string | null;
}) {
  const [consentiu, setConsentiu] = useState(false);
  const temCamera = useTemCameraNativa();
  const campoCamera = useRef<HTMLInputElement>(null);
  const campoGaleria = useRef<HTMLInputElement>(null);

  function escolher(campo: HTMLInputElement) {
    const arquivo = campo.files?.[0];
    // Limpa o campo: a foto não fica guardada nem no formulário.
    campo.value = "";
    if (arquivo) aoEscolher(arquivo);
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudarAberto}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-foreground/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute motion-reduce:transition-none" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl bg-background text-foreground shadow-xl transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
            <Dialog.Title className="text-base font-semibold sm:text-lg">
              Buscar por reconhecimento facial
            </Dialog.Title>
            <Dialog.Close
              aria-label="Fechar"
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col items-center gap-5 px-5 pt-6 pb-5 text-center">
            <IlustracaoBusca />
            <Dialog.Description className="max-w-xs text-muted-foreground">
              {temCamera
                ? "Tire uma selfie agora ou escolha da sua galeria uma foto em que seu rosto apareça bem."
                : "Escolha uma foto em que seu rosto apareça bem. Mostramos só as fotos do evento em que você está."}
            </Dialog.Description>
            <p className="text-sm text-muted-foreground">
              Dica: de frente, com boa luz, sem óculos escuros e só você na foto.
            </p>

            <label className="flex items-start gap-3 rounded-lg bg-accent/60 p-3 text-left text-sm">
              <input
                type="checkbox"
                checked={consentiu}
                onChange={(e) => setConsentiu(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span>
                <ShieldCheck aria-hidden="true" className="mr-1 inline size-4 text-primary" />
                Autorizo usar esta foto só para esta busca. Ela é comparada com os rostos das fotos
                deste evento e descartada em seguida: não guardamos a sua foto nem os traços do seu
                rosto.
              </span>
            </label>

            <input
              ref={campoCamera}
              type="file"
              accept="image/*"
              capture="user"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => escolher(e.currentTarget)}
            />
            <input
              ref={campoGaleria}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => escolher(e.currentTarget)}
            />

            {buscando ? (
              <p role="status" className="flex h-11 items-center gap-2 font-medium text-primary">
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
                Procurando você nas fotos…
              </p>
            ) : (
              <div className={`grid w-full gap-3 ${temCamera ? "grid-cols-2" : "grid-cols-1"}`}>
                {temCamera && (
                  <Button
                    size="touch"
                    variant="outline"
                    className="border-primary text-primary hover:bg-accent hover:text-primary"
                    disabled={!consentiu}
                    onClick={() => campoCamera.current?.click()}
                  >
                    <Camera aria-hidden="true" data-icon="inline-start" />
                    Tirar foto
                  </Button>
                )}
                <Button
                  size="touch"
                  disabled={!consentiu}
                  onClick={() => campoGaleria.current?.click()}
                >
                  <ImageUp aria-hidden="true" data-icon="inline-start" />
                  Carregar foto
                </Button>
              </div>
            )}
            {!consentiu && !buscando && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Marque a autorização acima para continuar.
              </p>
            )}

            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Celular com um rosto sendo reconhecido e fotos do evento em volta. Só decorativa. */
function IlustracaoBusca() {
  return (
    <svg
      viewBox="0 0 200 150"
      aria-hidden="true"
      className="h-36 w-auto"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="100" cy="75" r="68" className="fill-accent" />
      {/* Fotos do evento */}
      <g transform="rotate(-12 42 58)">
        <rect
          x="18"
          y="38"
          width="48"
          height="40"
          rx="6"
          className="fill-background stroke-primary"
          strokeWidth="2.5"
        />
        <circle cx="32" cy="51" r="5" className="fill-primary/25" />
        <path d="M22 72l13-12 9 8 8-6 10 10" className="stroke-primary/60" strokeWidth="2.5" />
      </g>
      <g transform="rotate(10 160 96)">
        <rect
          x="136"
          y="76"
          width="48"
          height="40"
          rx="6"
          className="fill-background stroke-primary"
          strokeWidth="2.5"
        />
        <circle cx="150" cy="89" r="5" className="fill-primary/25" />
        <path d="M140 110l13-12 9 8 8-6 10 10" className="stroke-primary/60" strokeWidth="2.5" />
      </g>
      {/* Celular */}
      <rect
        x="70"
        y="14"
        width="60"
        height="112"
        rx="12"
        className="fill-background stroke-primary"
        strokeWidth="3"
      />
      <path d="M92 22h16" className="stroke-primary/40" strokeWidth="3" />
      {/* Rosto */}
      <circle cx="100" cy="64" r="15" className="stroke-primary" strokeWidth="3" />
      <path d="M78 108c3-14 12-21 22-21s19 7 22 21" className="stroke-primary" strokeWidth="3" />
      {/* Moldura do reconhecimento */}
      <path
        d="M80 48v-6h8M120 48v-6h-8M80 80v6h8M120 80v6h-8"
        className="stroke-primary"
        strokeWidth="3"
      />
      <path d="M78 64h44" className="stroke-primary/50 motion-safe:animate-pulse" strokeWidth="2" />
    </svg>
  );
}
