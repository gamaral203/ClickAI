"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { salvarRepasseAcao, type EstadoRepasse } from "@/app/(fotografo)/painel/perfil/acoes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const DIAS_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta"];
const classeSelect =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
const inicial: EstadoRepasse = {};

export function FormularioRepasse({
  frequencia,
  dia,
}: {
  frequencia: "diaria" | "semanal" | "mensal";
  dia: number | null;
}) {
  const [estado, acao, enviando] = useActionState(salvarRepasseAcao, inicial);
  const [escolhida, setEscolhida] = useState(frequencia);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="frequenciaRepasse">Frequência</Label>
          <select
            id="frequenciaRepasse"
            name="frequenciaRepasse"
            value={escolhida}
            onChange={(e) => setEscolhida(e.target.value as typeof frequencia)}
            className={classeSelect}
          >
            <option value="diaria">Diária (todo dia útil)</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
          </select>
        </div>
        {escolhida === "semanal" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="diaSemana">Dia da semana</Label>
            <select
              id="diaSemana"
              name="diaSemana"
              defaultValue={frequencia === "semanal" && dia ? dia : 5}
              className={classeSelect}
            >
              {DIAS_SEMANA.map((nome, i) => (
                <option key={nome} value={i + 1}>
                  Toda {nome}-feira
                </option>
              ))}
            </select>
          </div>
        )}
        {escolhida === "mensal" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="diaMes">Dia do mês</Label>
            <select
              id="diaMes"
              name="diaMes"
              defaultValue={frequencia === "mensal" && dia ? dia : 1}
              className={classeSelect}
            >
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Dia {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Se o dia cair num fim de semana ou feriado, o repasse sai no dia útil seguinte.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="touch" disabled={enviando}>
          {enviando && (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          )}
          Salvar frequência
        </Button>
        {estado.ok && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Salvo.
          </span>
        )}
        {estado.erro && (
          <span role="alert" className="text-sm text-destructive">
            {estado.erro}
          </span>
        )}
      </div>
    </form>
  );
}
