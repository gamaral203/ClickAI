"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState, useTransition } from "react";
import { Check, Info, Loader2 } from "lucide-react";

import { escolherModeloMarcaAcao } from "@/app/(fotografo)/painel/marca-dagua/acoes";
import { INFO_MODELOS_MARCA, MODELOS_MARCA, type ModeloMarca } from "@/lib/marca-dagua";

/** Cinco tracinhos, os `nota` primeiros acesos na cor da escala. */
function Escala({ rotulo, nota, cor }: { rotulo: string; nota: number; cor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="flex gap-1" role="img" aria-label={`${rotulo}: ${nota} de 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`h-1.5 w-5 rounded-full ${i < nota ? cor : "bg-muted"}`}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * Grade de modelos de marca d'água, cada um com a amostra numa foto de exemplo e as notas de
 * visibilidade e proteção. Clicar escolhe na hora; o modelo vale para as próximas fotos.
 */
export function EscolhaDaMarca({ atual }: { atual: ModeloMarca }) {
  const reduzir = useReducedMotion();
  const [escolhido, setEscolhido] = useState(atual);
  const [salvando, startSalvar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function escolher(modelo: ModeloMarca) {
    if (modelo === escolhido || salvando) return;
    const antes = escolhido;
    setEscolhido(modelo);
    setAviso(null);
    startSalvar(async () => {
      const r = await escolherModeloMarcaAcao(modelo).catch(() => ({
        erro: "Não foi possível salvar.",
      }));
      if (r.erro) {
        setEscolhido(antes);
        setAviso({ tipo: "erro", texto: r.erro });
      } else {
        setAviso({
          tipo: "ok",
          texto: `Modelo ${INFO_MODELOS_MARCA[modelo].nome} salvo. Vale para as próximas fotos que você enviar.`,
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />O modelo vale para as fotos
        enviadas daqui em diante, em todos os seus eventos (inclusive as que colaboradores enviam
        neles). As fotos já enviadas continuam com a marca de antes.
      </p>

      {aviso && (
        <p
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className={`text-sm ${aviso.tipo === "erro" ? "text-destructive" : "text-primary"}`}
        >
          {aviso.texto}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup">
        {MODELOS_MARCA.map((modelo) => {
          const info = INFO_MODELOS_MARCA[modelo];
          const ativo = modelo === escolhido;
          return (
            <li key={modelo} className="flex">
              <motion.button
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => escolher(modelo)}
                whileHover={reduzir ? undefined : { y: -2 }}
                className={`relative flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  ativo ? "border-primary shadow-md ring-2 ring-primary" : "hover:shadow-md"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- amostra gerada na hora, já otimizada */}
                <img
                  src={`/painel/marca-dagua/amostra/${modelo}`}
                  alt={`Exemplo do modelo ${info.nome}`}
                  width={800}
                  height={533}
                  loading="lazy"
                  className="aspect-[3/2] w-full bg-muted object-cover"
                />
                {ativo && (
                  <motion.span
                    initial={reduzir ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                    className="absolute top-3 left-3 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
                  >
                    {salvando ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Check aria-hidden="true" className="size-5" strokeWidth={3} />
                    )}
                  </motion.span>
                )}
                <span className="flex flex-col gap-2 p-4">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{info.nome}</span>
                    {ativo && <span className="text-xs font-medium text-primary">Em uso</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">{info.descricao}</span>
                  <Escala rotulo="Visibilidade" nota={info.visibilidade} cor="bg-sky-500" />
                  <Escala rotulo="Proteção" nota={info.protecao} cor="bg-rose-500" />
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
