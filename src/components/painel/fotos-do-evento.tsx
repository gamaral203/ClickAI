"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CalendarClock, Loader2, Undo2, Unlock } from "lucide-react";

import {
  mudarLiberacaoAcao,
  type ResultadoLiberacao,
} from "@/app/(fotografo)/painel/eventos/liberacao-acoes";
import { AtualizarNaHora } from "@/components/galeria/contagem-regressiva";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoLiberacao } from "@/lib/liberacao";

import { GradeFotosPainel, type ItemDoPainel } from "./grade-fotos-painel";

type Filtro = "todas" | EstadoLiberacao;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "liberada", rotulo: "Liberadas" },
  { valor: "agendada", rotulo: "Agendadas" },
  { valor: "manual", rotulo: "Aguardando" },
];

type Mudanca = { acao: "liberar" } | { acao: "cancelar" } | { acao: "agendar"; em: string };

/**
 * Fotos do evento no painel, com filtro pelo estado da liberação. O dono escolhe fotos (ou usa
 * todas as ainda não liberadas) e libera agora, agenda, reagenda ou cancela o agendamento. O
 * horário é o de Brasília, e o servidor recusa horário no passado.
 */
export function FotosDoEvento({
  eventoId,
  itens,
  pastas,
  podeLiberar,
}: {
  eventoId: string;
  itens: ItemDoPainel[];
  pastas: { id: string; nome: string }[];
  podeLiberar: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [quando, setQuando] = useState("");
  const [resultado, setResultado] = useState<ResultadoLiberacao | null>(null);
  const [pendente, startTransition] = useTransition();

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todas: itens.length, liberada: 0, agendada: 0, manual: 0 };
    for (const item of itens) c[item.estadoLiberacao]++;
    return c;
  }, [itens]);
  const visiveis = filtro === "todas" ? itens : itens.filter((i) => i.estadoLiberacao === filtro);
  // Seleção só de fotos ainda não liberadas e que ainda existem na lista.
  const escolhidas = itens.filter(
    (i) => selecionados.has(i.id) && i.estadoLiberacao !== "liberada",
  );
  const naoLiberadas = contagem.agendada + contagem.manual;
  const alvo =
    escolhidas.length > 0 ? escolhidas : itens.filter((i) => i.estadoLiberacao !== "liberada");
  const temAgendada = alvo.some((i) => i.estadoLiberacao === "agendada");
  // Próxima liberação agendada: a grade se atualiza sozinha nesse minuto.
  const proxima = itens
    .filter((i) => i.estadoLiberacao === "agendada" && i.liberarEm)
    .map((i) => i.liberarEm!)
    .sort()[0];

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function aplicar(mudanca: Mudanca) {
    setResultado(null);
    startTransition(async () => {
      const resposta = await mudarLiberacaoAcao({
        eventoId,
        mudanca,
        ...(escolhidas.length > 0 && { fotoIds: escolhidas.map((i) => i.id) }),
      }).catch(() => ({ erro: "Não foi possível concluir. Tente de novo." }));
      setResultado(resposta);
      if (!resposta.erro) {
        setSelecionados(new Set());
        router.refresh();
      }
    });
  }

  const textoAlvo =
    escolhidas.length > 0
      ? `${escolhidas.length} ${escolhidas.length === 1 ? "foto escolhida" : "fotos escolhidas"}`
      : `todas as ${naoLiberadas} ainda não liberadas`;

  return (
    <div className="flex flex-col gap-4">
      {proxima && <AtualizarNaHora alvo={proxima} />}
      {itens.length > 0 && (
        <div role="group" aria-label="Filtrar pela liberação" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Button
              key={f.valor}
              size="touch"
              variant={filtro === f.valor ? "default" : "outline"}
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
            >
              {f.rotulo} ({contagem[f.valor]})
            </Button>
          ))}
        </div>
      )}

      {podeLiberar && naoLiberadas > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <p className="text-sm">
            Vale para <strong>{textoAlvo}</strong>.{" "}
            {escolhidas.length === 0 && (
              <span className="text-muted-foreground">
                Marque “Selecionar” nas fotos para mudar só algumas.
              </span>
            )}
            {escolhidas.length > 0 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => setSelecionados(new Set())}
              >
                Limpar a seleção
              </Button>
            )}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Button size="touch" disabled={pendente} onClick={() => aplicar({ acao: "liberar" })}>
              {pendente ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Unlock aria-hidden="true" />
              )}
              Liberar agora
            </Button>
            <form
              className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (quando) aplicar({ acao: "agendar", em: quando });
                else setResultado({ erro: "Escolha a data e a hora da liberação." });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`agendar-${eventoId}`} className="text-sm font-medium">
                  Agendar para (horário de Brasília)
                </label>
                <Input
                  id={`agendar-${eventoId}`}
                  type="datetime-local"
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button type="submit" size="touch" variant="outline" disabled={pendente}>
                <CalendarClock aria-hidden="true" />
                {temAgendada ? "Agendar ou reagendar" : "Agendar"}
              </Button>
            </form>
            {temAgendada && (
              <Button
                size="touch"
                variant="ghost"
                disabled={pendente}
                onClick={() => aplicar({ acao: "cancelar" })}
              >
                <Undo2 aria-hidden="true" />
                Cancelar agendamento
              </Button>
            )}
          </div>
          {resultado?.erro && (
            <div
              role="alert"
              className="flex flex-col gap-2 text-sm text-destructive sm:flex-row sm:items-center"
            >
              <span>{resultado.erro}</span>
              {resultado.horarioPassado && (
                <Button size="sm" disabled={pendente} onClick={() => aplicar({ acao: "liberar" })}>
                  Liberar agora
                </Button>
              )}
            </div>
          )}
          {resultado && !resultado.erro && (
            <p role="status" className="text-sm text-primary">
              {resultado.alteradas === 0
                ? "Nenhuma foto precisava mudar."
                : `${resultado.alteradas} ${resultado.alteradas === 1 ? "foto atualizada" : "fotos atualizadas"}.`}
            </p>
          )}
        </div>
      )}

      <GradeFotosPainel
        itens={visiveis}
        pastas={pastas}
        selecao={podeLiberar ? { selecionados, alternar } : undefined}
        vazio={itens.length === 0 ? undefined : "Nenhuma foto neste filtro."}
      />
    </div>
  );
}
