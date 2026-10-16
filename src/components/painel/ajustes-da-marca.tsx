"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  salvarAjustesDaMarcaAcao,
  type ValoresDosAjustes,
} from "@/app/(fotografo)/painel/marca-dagua/acoes";
import { Button } from "@/components/ui/button";
import { INFO_MODELOS_MARCA, type ModeloMarca } from "@/lib/marca-dagua";
import { LIMITES_MARCA, type CampoAjusteMarca } from "@/lib/protecao-previas";

const CONTROLES: {
  campo: CampoAjusteMarca;
  rotulo: string;
  unidade: string;
  passo: number;
  ajuda: string;
}[] = [
  {
    campo: "tamanhoPct",
    rotulo: "Tamanho das marcas",
    unidade: "%",
    passo: 5,
    ajuda: "Marcas maiores cobrem mais da foto.",
  },
  {
    campo: "quantidade",
    rotulo: "Quantidade de marcas",
    unidade: "",
    passo: 1,
    ajuda: "Quantas logos se espalham pela prévia.",
  },
  {
    campo: "opacidadePct",
    rotulo: "Força (opacidade)",
    unidade: "%",
    passo: 1,
    ajuda: "Mais forte é mais difícil de apagar, e mais aparece.",
  },
];

/**
 * "Ajustar a marca" em Painel > Marca d'água: tamanho, quantidade e opacidade das logos por cima
 * do modelo escolhido, com a amostra redesenhada pelo servidor enquanto o fotógrafo mexe (antes
 * de salvar). Os limites são os da gestão: a marca nunca fica fraca demais. "Voltar ao padrão"
 * apaga os ajustes e volta aos valores da gestão.
 */
export function AjustesDaMarca({
  modelo,
  padrao,
  salvos,
}: {
  modelo: ModeloMarca;
  /** Os valores da gestão (o padrão do ClicouAí). */
  padrao: ValoresDosAjustes;
  /** Os ajustes salvos na conta, ou `null` (usa o padrão). */
  salvos: ValoresDosAjustes | null;
}) {
  const [valores, setValores] = useState<ValoresDosAjustes>(salvos ?? padrao);
  const [src, setSrc] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  // A amostra espera o fotógrafo parar de arrastar antes de pedir outra ao servidor.
  useEffect(() => {
    const espera = window.setTimeout(() => {
      const busca = new URLSearchParams({
        tamanhoPct: String(valores.tamanhoPct),
        quantidade: String(valores.quantidade),
        opacidadePct: String(valores.opacidadePct),
      });
      setCarregando(true);
      setSrc(`/painel/marca-dagua/amostra/${modelo}?${busca}`);
    }, 350);
    return () => window.clearTimeout(espera);
  }, [modelo, valores]);

  const mudou = JSON.stringify(valores) !== JSON.stringify(salvos ?? padrao);

  function salvar(novo: ValoresDosAjustes | null) {
    setAviso(null);
    iniciar(async () => {
      const r: { erro?: string; ok?: string } = await salvarAjustesDaMarcaAcao(novo).catch(() => ({
        erro: "Não foi possível salvar.",
      }));
      if (r.erro) setAviso({ texto: r.erro, erro: true });
      else {
        if (novo === null) setValores(padrao);
        setAviso({ texto: r.ok ?? "Salvo.", erro: false });
      }
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <SlidersHorizontal aria-hidden="true" className="size-5 text-primary" />
          Ajustar a marca
        </h2>
        <p className="text-sm text-muted-foreground">
          Deixe as marcas do modelo <strong>{INFO_MODELOS_MARCA[modelo].nome}</strong> maiores, em
          maior número ou mais fortes. Vale para as próximas fotos que você enviar.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4">
          {CONTROLES.map((c) => (
            <Deslizante
              key={c.campo}
              {...c}
              valor={valores[c.campo]}
              aoMudar={(v) => setValores((atual) => ({ ...atual, [c.campo]: v }))}
            />
          ))}
          {aviso && (
            <p
              role={aviso.erro ? "alert" : "status"}
              className={`flex items-center gap-1.5 text-sm ${aviso.erro ? "text-destructive" : "text-primary"}`}
            >
              {!aviso.erro && <CheckCircle2 aria-hidden="true" className="size-4" />}
              {aviso.texto}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="touch"
              disabled={salvando || !mudou}
              onClick={() => salvar(valores)}
            >
              {salvando && (
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              )}
              Salvar ajustes
            </Button>
            <Button
              type="button"
              size="touch"
              variant="outline"
              disabled={salvando || !salvos}
              onClick={() => salvar(null)}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Voltar ao padrão
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-muted">
            {src && (
              // Amostra gerada na hora pelo servidor, com os valores da tela: sem next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`Amostra da prévia com a marca ${INFO_MODELOS_MARCA[modelo].nome} ajustada`}
                className="size-full object-contain"
                onLoad={() => setCarregando(false)}
                onError={() => setCarregando(false)}
              />
            )}
            {carregando && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                <span className="sr-only">Gerando a amostra</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Amostra com os valores da tela, ainda sem salvar. Quem compra recebe a foto original,
            sem marca.
          </p>
        </div>
      </div>
    </section>
  );
}

function Deslizante({
  campo,
  rotulo,
  unidade,
  passo,
  ajuda,
  valor,
  aoMudar,
}: {
  campo: CampoAjusteMarca;
  rotulo: string;
  unidade: string;
  passo: number;
  ajuda: string;
  valor: number;
  aoMudar: (valor: number) => void;
}) {
  const id = useId();
  const { min, max } = LIMITES_MARCA[campo];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {rotulo}
        </label>
        <output htmlFor={id} className="text-sm font-semibold tabular-nums">
          {valor}
          {unidade}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        aria-describedby={`${id}-ajuda`}
        className="h-10 w-full cursor-pointer accent-primary"
      />
      <span id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        {ajuda}
      </span>
    </div>
  );
}
