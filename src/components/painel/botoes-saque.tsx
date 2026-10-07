"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, Zap } from "lucide-react";

import { solicitarSaqueAcao, type EstadoSaque } from "@/app/(fotografo)/painel/vendas/acoes";
import { Button } from "@/components/ui/button";
import { formatarPreco } from "@/lib/formatar";

type Previa = { brutoCentavos: number; taxaCentavos: number; liquidoCentavos: number };

const inicial: EstadoSaque = {};

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 ${forte ? "font-semibold" : "text-muted-foreground"}`}
    >
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function CartaoSaque({
  tipo,
  titulo,
  descricao,
  previa,
  liberado,
  acao,
  enviando,
}: {
  tipo: "normal" | "antecipado";
  titulo: string;
  descricao: string;
  previa: Previa;
  liberado: boolean;
  acao: (formulario: FormData) => void;
  enviando: boolean;
}) {
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-xl border p-5">
      <input type="hidden" name="tipo" value={tipo} />
      <h3 className="flex items-center gap-2 font-semibold">
        {tipo === "antecipado" && <Zap aria-hidden="true" className="size-4 text-primary" />}
        {titulo}
      </h3>
      <p className="text-sm text-muted-foreground">{descricao}</p>
      <div className="flex flex-col gap-1 text-sm">
        <Linha rotulo="Vendas" valor={formatarPreco(previa.brutoCentavos)} />
        <Linha rotulo="Taxas" valor={`− ${formatarPreco(previa.taxaCentavos)}`} />
        <Linha rotulo="Você recebe" valor={formatarPreco(previa.liquidoCentavos)} forte />
      </div>
      <Button
        type="submit"
        size="touch"
        variant={tipo === "normal" ? "default" : "outline"}
        disabled={!liberado || enviando}
      >
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        {tipo === "normal" ? "Sacar" : "Sacar antecipado"}
      </Button>
    </form>
  );
}

export function BotoesSaque({
  normal,
  antecipado,
  podeSacar,
  minimoCentavos,
}: {
  normal: Previa;
  antecipado: Previa;
  /** Tem chave Pix confirmada e nenhum saque em andamento. */
  podeSacar: boolean;
  minimoCentavos: number;
}) {
  const [estado, acao, enviando] = useActionState(solicitarSaqueAcao, inicial);
  // O antecipado só faz sentido quando antecipa algo além do que o saque normal já paga.
  const temAntecipacao = antecipado.brutoCentavos > normal.brutoCentavos;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <CartaoSaque
          tipo="normal"
          titulo="Saque normal"
          descricao="Vendas com 30 dias ou mais. Taxa de 10%."
          previa={normal}
          liberado={podeSacar && normal.liquidoCentavos >= minimoCentavos}
          acao={acao}
          enviando={enviando}
        />
        <CartaoSaque
          tipo="antecipado"
          titulo="Saque antecipado"
          descricao="Vendas a partir de 1 dia. O que ainda não tem 30 dias paga 10% + 1% de antecipação."
          previa={antecipado}
          liberado={podeSacar && temAntecipacao && antecipado.liquidoCentavos >= minimoCentavos}
          acao={acao}
          enviando={enviando}
        />
      </div>
      {estado.ok && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
    </div>
  );
}
