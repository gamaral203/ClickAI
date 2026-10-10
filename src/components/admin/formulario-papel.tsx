"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";

import { mudarPapelAcao, type EstadoPapel } from "@/app/(admin)/admin/usuarios/acoes";
import { Button } from "@/components/ui/button";
import type { Papel } from "@/dados";

import { ROTULO_PAPEL } from "./tabela";

const inicial: EstadoPapel = {};

export function FormularioPapel({ usuarioId, papel }: { usuarioId: string; papel: Papel }) {
  const [estado, acao, enviando] = useActionState(mudarPapelAcao, inicial);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <select
        name="papel"
        defaultValue={papel}
        aria-label="Papel do usuário"
        className="h-10 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {Object.entries(ROTULO_PAPEL).map(([valor, rotulo]) => (
          <option key={valor} value={valor}>
            {rotulo}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="lg" className="h-10" disabled={enviando}>
        {enviando ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : estado.ok ? (
          <Check aria-hidden="true" />
        ) : null}
        Salvar
      </Button>
      {estado.erro && (
        <span role="alert" className="text-xs text-destructive">
          {estado.erro}
        </span>
      )}
    </form>
  );
}
