"use client";

import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { Check, Play, ShoppingCart, X } from "lucide-react";

import { adicionarAoCarrinho, MAXIMO_ITENS, useCarrinho } from "@/components/carrinho/carrinho";
import { enviarMetrica } from "@/components/metricas/registrar";
import { Button } from "@/components/ui/button";
import type { Foto } from "@/dados/tipos";
import { formatarPreco } from "@/lib/formatar";

/** "1 foto", "3 fotos" ou, com vídeo no meio, "1 vídeo" e "3 itens". */
export function rotuloQuantidade(fotos: readonly Foto[]) {
  const n = fotos.length;
  if (fotos.some((f) => f.tipo === "video")) return n === 1 ? "1 vídeo" : `${n} itens`;
  return n === 1 ? "1 foto" : `${n} fotos`;
}

function textoDaSelecao(fotos: readonly Foto[]) {
  const n = fotos.length;
  if (n === 0) return "Nenhuma foto selecionada";
  if (fotos.some((f) => f.tipo === "video")) {
    return n === 1 ? "1 vídeo selecionado" : `${n} itens selecionados`;
  }
  return n === 1 ? "1 foto selecionada" : `${n} fotos selecionadas`;
}

/**
 * Painel que sobe de baixo ao tocar no obturador: as fotos selecionadas, o valor estimado (soma
 * dos preços cheios; o servidor recalcula tudo e aplica os descontos no carrinho) e o botão que
 * põe de uma vez no carrinho as que ainda não estão lá.
 */
export function PainelSelecao({
  aberto,
  aoMudarAberto,
  fotos,
  totalCentavos,
  aoRemover,
  aoAdicionar,
}: {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** Fotos selecionadas, na ordem em que foram escolhidas. */
  fotos: readonly Foto[];
  /** Soma estimada; `null` quando falta o preço de algum item. */
  totalCentavos: number | null;
  aoRemover: (fotoId: string) => void;
  /** Depois de pôr no carrinho, com quantas eram novas. */
  aoAdicionar: (novas: number) => void;
}) {
  const noCarrinho = useCarrinho();
  const novas = fotos.filter((f) => !noCarrinho.includes(f.id));
  const cabe = noCarrinho.length + novas.length <= MAXIMO_ITENS;

  function adicionar() {
    for (const foto of novas) {
      adicionarAoCarrinho(foto.id);
      enviarMetrica({ tipo: "carrinho", fotoId: foto.id });
    }
    aoAdicionar(novas.length);
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudarAberto}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-profundo/50 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute motion-reduce:transition-none" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-background pb-[env(safe-area-inset-bottom)] text-foreground shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none data-ending-style:translate-y-full data-starting-style:translate-y-full motion-reduce:transition-none">
          <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-border" />
          <div className="flex items-center justify-between gap-2 px-5 pt-2 pb-3">
            <div className="flex flex-col">
              <Dialog.Title className="text-lg font-semibold">Sua seleção</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground" role="status">
                {textoDaSelecao(fotos)}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {fotos.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Toque no obturador no canto de uma foto para selecionar. Depois, coloque todas no
                carrinho de uma vez.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 pb-1 sm:grid-cols-4">
                {fotos.map((foto, i) => {
                  const jaNoCarrinho = noCarrinho.includes(foto.id);
                  return (
                    <li key={foto.id} className="relative">
                      <div
                        onContextMenu={(e) => e.preventDefault()}
                        className="relative aspect-square overflow-hidden rounded-xl bg-muted"
                      >
                        <Image
                          src={foto.urlMiniatura}
                          alt={`Item ${i + 1} da seleção`}
                          fill
                          draggable={false}
                          sizes="(min-width: 640px) 160px, 33vw"
                          className="object-cover imagem-protegida"
                        />
                        {foto.tipo === "video" && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 m-auto flex size-8 items-center justify-center rounded-full bg-black/55 text-white"
                          >
                            <Play className="ml-0.5 size-4 fill-current" />
                          </span>
                        )}
                        {jaNoCarrinho && (
                          <span className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-lg bg-profundo/85 px-1 py-0.5 text-[0.7rem] font-semibold text-white">
                            <Check aria-hidden="true" className="size-3 text-highlight" />
                            No carrinho
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => aoRemover(foto.id)}
                        aria-label={`Tirar o item ${i + 1} da seleção`}
                        className="absolute -top-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full bg-profundo text-white shadow-md ring-2 ring-background outline-none after:absolute after:-inset-1.5 hover:bg-primary focus-visible:ring-ring"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t px-5 pt-4 pb-5">
            {fotos.length > 0 && (
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Total estimado</span>
                  <span className="text-xs text-muted-foreground">
                    Descontos aplicados no carrinho
                  </span>
                </div>
                <span className="text-xl font-bold tabular-nums">
                  {totalCentavos === null ? "Ver no carrinho" : formatarPreco(totalCentavos)}
                </span>
              </div>
            )}
            {!cabe && (
              <p className="text-sm text-destructive">
                O carrinho aceita até {MAXIMO_ITENS} itens. Tire algumas fotos da seleção ou
                finalize a compra que já está no carrinho.
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close
                render={<Button variant="outline" size="touch" />}
                className="sm:w-auto"
              >
                Continuar escolhendo
              </Dialog.Close>
              <Button size="touch" disabled={fotos.length === 0 || !cabe} onClick={adicionar}>
                <ShoppingCart aria-hidden="true" data-icon="inline-start" />
                Adicionar ao carrinho
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
