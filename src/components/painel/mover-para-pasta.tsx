"use client";

import { useState, useTransition } from "react";
import { FolderInput, FolderPlus, Loader2 } from "lucide-react";

import { criarPastaAcao, moverFotosAcao } from "@/app/(fotografo)/painel/eventos/pastas-acoes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FiltroDoPainel } from "@/lib/filtro-painel";
import { SEPARADOR_DE_PASTA } from "@/lib/pastas";

/** Pasta no seletor: o caminho no nome ("Largada › Bateria 1"), a pasta de cima e o nível. */
export type PastaDoSeletor = {
  id: string;
  nome: string;
  pastaPaiId: string | null;
  nivel: 1 | 2;
};

type Selecao = { tipo: "ids"; ids: string[] } | { tipo: "filtro"; filtro: FiltroDoPainel };

/** Até 5.000 ids por chamada (limite da ação). "Todas do filtro" vai numa chamada só. */
const IDS_POR_VEZ = 5000;
const SEM_PASTA = "";

const numero = new Intl.NumberFormat("pt-BR");
const fotos = (n: number) => `${numero.format(n)} ${n === 1 ? "foto" : "fotos"}`;

/**
 * "Mover para…": escolhe a pasta de destino na árvore (ou "Sem pasta", que tira da pasta), cria
 * uma pasta nova ali mesmo, se precisar, e confirma com a quantidade antes de mover. A seleção
 * vai como ids ou como o filtro ("todas do filtro"); o servidor confere tudo de novo.
 */
export function MoverParaPasta({
  eventoId,
  quantidade,
  selecao,
  pastas,
  aoMover,
}: {
  eventoId: string;
  quantidade: number;
  selecao: Selecao;
  pastas: PastaDoSeletor[];
  /** Terminou: quantas o servidor moveu e o caminho do destino (`null` = sem pasta). */
  aoMover: (movidas: number, destino: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<"escolher" | "confirmar">("escolher");
  const [destino, setDestino] = useState(SEM_PASTA);
  /** Pastas criadas no diálogo, até a página trazer a árvore atualizada. */
  const [criadas, setCriadas] = useState<PastaDoSeletor[]>([]);
  const [criando, setCriando] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  const [paiNova, setPaiNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

  const todas = [...pastas, ...criadas.filter((c) => !pastas.some((p) => p.id === c.id))];
  const arvore = ordenarArvore(todas);
  const nivel1 = arvore.filter((p) => p.nivel === 1);
  const nomeDestino =
    destino === SEM_PASTA ? null : (todas.find((p) => p.id === destino)?.nome ?? null);

  function abrir(sim: boolean) {
    if (ocupado) return;
    setAberto(sim);
    if (sim) {
      setEtapa("escolher");
      setErro(null);
      setCriando(false);
      setNomeNova("");
      setPaiNova("");
    }
  }

  function criar() {
    setErro(null);
    const nome = nomeNova.trim();
    if (!nome) return setErro("Dê um nome à pasta.");
    startTransition(async () => {
      const r = await criarPastaAcao(eventoId, nome, paiNova || null).catch(() => ({
        erro: "Não foi possível criar a pasta.",
        pastaId: undefined,
      }));
      if (r.erro || !r.pastaId) return setErro(r.erro ?? "Não foi possível criar a pasta.");
      const pai = nivel1.find((p) => p.id === paiNova);
      const nova: PastaDoSeletor = {
        id: r.pastaId,
        nome: pai ? `${pai.nome}${SEPARADOR_DE_PASTA}${nome}` : nome,
        pastaPaiId: pai?.id ?? null,
        nivel: pai ? 2 : 1,
      };
      setCriadas((atual) => [...atual, nova]);
      setDestino(nova.id);
      setCriando(false);
      setNomeNova("");
      setPaiNova("");
    });
  }

  function mover() {
    setErro(null);
    const pastaId = destino === SEM_PASTA ? null : destino;
    startTransition(async () => {
      let movidas = 0;
      const chamadas =
        selecao.tipo === "filtro"
          ? [selecao]
          : Array.from({ length: Math.ceil(selecao.ids.length / IDS_POR_VEZ) }, (_, i) => ({
              tipo: "ids" as const,
              ids: selecao.ids.slice(i * IDS_POR_VEZ, (i + 1) * IDS_POR_VEZ),
            }));
      for (const parte of chamadas) {
        const r = await moverFotosAcao({ eventoId, selecao: parte, pastaId }).catch(() => ({
          erro: "Não foi possível mover. Tente de novo.",
          movidas: undefined,
        }));
        if (r.erro) {
          setErro(movidas > 0 ? `${r.erro} (${fotos(movidas)} já foram movidas.)` : r.erro);
          return;
        }
        movidas += r.movidas ?? 0;
      }
      setAberto(false);
      aoMover(movidas, nomeDestino);
    });
  }

  return (
    <>
      <Button size="touch" className="flex-1 sm:flex-none" onClick={() => abrir(true)}>
        <FolderInput aria-hidden="true" />
        Mover para…
      </Button>
      <AlertDialog open={aberto} onOpenChange={abrir}>
        <AlertDialogContent>
          {etapa === "escolher" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Mover {fotos(quantidade)} para…</AlertDialogTitle>
                <AlertDialogDescription>
                  Escolha a pasta de destino. “Sem pasta” tira as fotos da pasta em que estão.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`destino-${eventoId}`} className="text-sm font-medium">
                  Pasta de destino
                </label>
                <select
                  id={`destino-${eventoId}`}
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value={SEM_PASTA}>Sem pasta (tirar da pasta)</option>
                  {arvore.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              {criando ? (
                <form
                  className="flex flex-col gap-3 rounded-lg border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    criar();
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`nova-pasta-${eventoId}`} className="text-sm font-medium">
                      Nome da nova pasta
                    </label>
                    <Input
                      id={`nova-pasta-${eventoId}`}
                      value={nomeNova}
                      maxLength={60}
                      autoFocus
                      placeholder="Ex.: Dia 1"
                      onChange={(e) => setNomeNova(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  {nivel1.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`pai-nova-${eventoId}`} className="text-sm font-medium">
                        Onde
                      </label>
                      <select
                        id={`pai-nova-${eventoId}`}
                        value={paiNova}
                        onChange={(e) => setPaiNova(e.target.value)}
                        className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="">Pasta principal (nível 1)</option>
                        {nivel1.map((p) => (
                          <option key={p.id} value={p.id}>
                            Subpasta de {p.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      size="touch"
                      variant="ghost"
                      disabled={ocupado}
                      onClick={() => setCriando(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" size="touch" variant="outline" disabled={ocupado}>
                      {ocupado ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <FolderPlus aria-hidden="true" />
                      )}
                      Criar e usar
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  size="touch"
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    setErro(null);
                    setCriando(true);
                  }}
                >
                  <FolderPlus aria-hidden="true" />
                  Nova pasta
                </Button>
              )}
              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
                <Button
                  size="touch"
                  disabled={ocupado || criando || quantidade === 0}
                  onClick={() => {
                    setErro(null);
                    setEtapa("confirmar");
                  }}
                >
                  Continuar
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {nomeDestino === null
                    ? `Tirar ${fotos(quantidade)} da pasta?`
                    : `Mover ${fotos(quantidade)} para ${nomeDestino}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {selecao.tipo === "filtro"
                    ? "Vale para todas as fotos deste filtro, conferidas de novo na hora de mover. As fotos não são apagadas nem mudam na galeria, só de pasta."
                    : "As fotos não são apagadas, só mudam de pasta."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
              <AlertDialogFooter>
                <Button
                  size="touch"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => setEtapa("escolher")}
                >
                  Voltar
                </Button>
                <Button size="touch" disabled={ocupado} onClick={mover}>
                  {ocupado ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <FolderInput aria-hidden="true" />
                  )}
                  {nomeDestino === null ? "Tirar da pasta" : "Mover"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Cada pasta de nível 1 seguida das subpastas dela (as criadas agora entram no lugar certo). */
function ordenarArvore(pastas: PastaDoSeletor[]): PastaDoSeletor[] {
  const raizes = pastas.filter((p) => p.nivel === 1 || !pastas.some((r) => r.id === p.pastaPaiId));
  return raizes.flatMap((r) => [
    r,
    ...pastas.filter((p) => p.nivel === 2 && p.pastaPaiId === r.id),
  ]);
}
