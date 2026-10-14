"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { salvarConfiguracoesAcao, type EstadoConfiguracoes } from "@/app/(admin)/admin/uso/acoes";
import { AvisoSalvo, Campo, propsDeErro } from "@/components/painel/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enviarSemLimpar } from "@/lib/formulario";

const inicial: EstadoConfiguracoes = {};

/** Cotação do dólar (à mão) e limites do plano do Resend. */
export function FormularioConfiguracoes({
  cotacao,
  cotacaoAtualizada,
  limiteDia,
  limiteMes,
}: {
  /** Cotação já em texto ("5,45"), ou vazio. */
  cotacao: string;
  /** "Atualizada em 12/10/26 14:00", ou nulo. */
  cotacaoAtualizada: string | null;
  limiteDia: number;
  limiteMes: number;
}) {
  const [estado, acao, salvando] = useActionState(salvarConfiguracoesAcao, inicial);
  const erros = estado.erros ?? {};
  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          rotulo="Cotação US$ 1 = R$"
          id="config-cotacao"
          erro={erros.cotacao}
          ajuda={cotacaoAtualizada ?? "Ainda não definida: o dólar não entra no total."}
        >
          <Input
            {...propsDeErro("config-cotacao", erros.cotacao)}
            name="cotacao"
            defaultValue={cotacao}
            inputMode="decimal"
            placeholder="5,45"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
        <Campo
          rotulo="Limite de e-mails por dia"
          id="config-limite-dia"
          erro={erros.limiteDia}
          ajuda="Plano gratuito do Resend: 100."
        >
          <Input
            {...propsDeErro("config-limite-dia", erros.limiteDia)}
            name="limiteDia"
            defaultValue={String(limiteDia)}
            inputMode="numeric"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
        <Campo
          rotulo="Limite de e-mails por mês"
          id="config-limite-mes"
          erro={erros.limiteMes}
          ajuda="Plano gratuito do Resend: 3.000."
        >
          <Input
            {...propsDeErro("config-limite-mes", erros.limiteMes)}
            name="limiteMes"
            defaultValue={String(limiteMes)}
            inputMode="numeric"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="touch" variant="outline" disabled={salvando}>
          {salvando && <Loader2 aria-hidden="true" className="animate-spin" />}
          Salvar configurações
        </Button>
        {estado.ok && <AvisoSalvo>Configurações salvas.</AvisoSalvo>}
      </div>
    </form>
  );
}
