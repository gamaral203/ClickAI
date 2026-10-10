"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Clock, Plus, X } from "lucide-react";
import { cn } from "cn";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  campoDoDia,
  dataPorExtenso,
  diaDoCampo,
  juntarCampo,
  separarCampo,
} from "@/lib/campo-data";

// Dia + hora do evento, no horário de Brasília. O valor enviado ao servidor continua o do antigo
// <input type="datetime-local">: "2026-10-07T08:00" num campo oculto com o `name` do formulário.
// O dia nunca passa por `new Date("2026-10-07")` (que é meia-noite UTC e, em UTC-3, vira o dia
// anterior): o calendário trabalha com a data local do navegador, montada a partir dos números.

const classeGatilho =
  "inline-flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-input bg-transparent px-3 text-left text-base outline-none transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-primary aria-expanded:ring-3 aria-expanded:ring-ring/30 aria-invalid:border-destructive md:text-sm motion-reduce:transition-none";

const classeHora =
  "h-11 w-full rounded-lg border border-input bg-transparent pr-2 pl-9 text-base tabular-nums outline-none transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm relative cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";

/**
 * Abre o seletor de hora do navegador ao tocar no campo. No celular (Chrome/Android), tocar no
 * texto do <input type="time"> nem sempre abre o relógio: só o ícone abre, e ele está invisível.
 * O ícone passa a cobrir o campo inteiro (classe acima) e, onde existe, showPicker() garante.
 */
function abrirSeletorDeHora(campo: HTMLInputElement) {
  try {
    campo.showPicker?.();
  } catch {
    // Sem gesto do usuário ou navegador sem suporte: o toque no ícone invisível resolve.
  }
}

type Props = {
  /** Nome do campo no formulário (e base dos ids). */
  nome: string;
  rotulo: string;
  /** "2026-10-07T08:00" ou "". */
  valorInicial: string;
  erro?: string;
  /** Avisado a cada mudança, com o valor no formato do campo ("" se incompleto). */
  aoMudar?: (valor: string) => void;
  /** Primeiro dia que pode ser escolhido (AAAA-MM-DD). */
  minimo?: string;
  /**
   * Campo opcional: sem valor, aparece só o botão "Adicionar …"; com valor, ganha o botão de
   * remover. A hora sugerida ao escolher o dia vem de `horaSugerida`.
   */
  opcional?: { textoAdicionar: string; textoRemover: string };
  horaSugerida?: string;
};

export function CampoDataEvento({
  nome,
  rotulo,
  valorInicial,
  erro,
  aoMudar,
  minimo,
  opcional,
  horaSugerida = "08:00",
}: Props) {
  const ids = useId();
  const idRotulo = `${ids}-rotulo`;
  const idErro = `${nome}-erro`;
  const inicial = separarCampo(valorInicial);
  const [dia, setDia] = useState(inicial.dia);
  const [hora, setHora] = useState(inicial.hora);
  const [aberto, setAberto] = useState(false);
  const focarGatilho = useRef(false);
  useEffect(() => {
    if (!focarGatilho.current) return;
    focarGatilho.current = false;
    document.getElementById(nome)?.focus();
  }, [dia, nome]);

  function mudar(novoDia: string, novaHora: string) {
    setDia(novoDia);
    setHora(novaHora);
    aoMudar?.(juntarCampo(novoDia, novaHora));
  }

  const selecionado = dia ? diaDoCampo(dia) : undefined;
  const limite = minimo ? diaDoCampo(minimo) : undefined;
  const descricao = erro ? idErro : undefined;

  const calendario = (
    <PopoverContent initialFocus={false} aria-label={`Escolher o dia: ${rotulo.toLowerCase()}`}>
      <Calendar
        mode="single"
        autoFocus
        selected={selecionado}
        defaultMonth={selecionado ?? limite}
        disabled={limite ? { before: limite } : undefined}
        onSelect={(escolhido) => {
          if (!escolhido) return;
          const novo = campoDoDia(escolhido);
          // No campo opcional, o botão troca (adicionar ↔ dia escolhido): o foco vai junto.
          if (opcional && !dia) focarGatilho.current = true;
          mudar(novo, hora || horaSugerida);
          setAberto(false);
        }}
      />
    </PopoverContent>
  );

  // Opcional e vazio: só o botão de adicionar, que já abre o calendário.
  if (opcional && !dia) {
    return (
      <div className="flex flex-col gap-2">
        <span id={idRotulo} className="text-sm leading-none font-medium select-none">
          {rotulo} <span className="font-normal text-muted-foreground">(opcional)</span>
        </span>
        <input type="hidden" name={nome} value="" />
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger
            id={nome}
            aria-describedby={descricao}
            className={cn(
              classeGatilho,
              "w-full flex-none justify-center border-dashed text-muted-foreground hover:text-foreground sm:w-fit sm:justify-start",
            )}
          >
            <Plus aria-hidden="true" className="size-4" />
            {opcional.textoAdicionar}
          </PopoverTrigger>
          {calendario}
        </Popover>
        <Erro id={idErro} erro={erro} />
      </div>
    );
  }

  return (
    <div role="group" aria-labelledby={idRotulo} className="flex flex-col gap-2">
      <span id={idRotulo} className="text-sm leading-none font-medium select-none">
        {rotulo}
        {opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
      </span>
      <input type="hidden" name={nome} value={juntarCampo(dia, hora)} />
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger
            id={nome}
            aria-invalid={Boolean(erro)}
            aria-describedby={descricao}
            aria-label={`${rotulo}: ${dia ? dataPorExtenso(dia) : "escolher o dia"}`}
            className={cn(classeGatilho, "basis-full sm:basis-auto")}
          >
            <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <span className={cn("min-w-0 flex-1 truncate", !dia && "text-muted-foreground")}>
              {dia ? dataPorExtenso(dia) : "Escolha o dia"}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          {calendario}
        </Popover>
        <div className="relative min-w-0 flex-1 sm:w-32 sm:flex-none">
          <Clock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={`${nome}-hora`}
            type="time"
            step={300}
            value={hora}
            aria-label={`Hora (${rotulo.toLowerCase()}), horário de Brasília`}
            aria-invalid={Boolean(erro)}
            aria-describedby={descricao}
            onChange={(e) => mudar(dia, e.target.value)}
            onClick={(e) => abrirSeletorDeHora(e.currentTarget)}
            className={classeHora}
          />
        </div>
        {opcional && (
          <button
            type="button"
            aria-label={opcional.textoRemover}
            title={opcional.textoRemover}
            onClick={() => {
              focarGatilho.current = true;
              mudar("", "");
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <Erro id={idErro} erro={erro} />
    </div>
  );
}

function Erro({ id, erro }: { id: string; erro?: string }) {
  if (!erro) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {erro}
    </p>
  );
}
