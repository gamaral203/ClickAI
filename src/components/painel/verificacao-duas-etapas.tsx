"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import {
  verificacaoDuasEtapasAcao,
  type EstadoMfa,
} from "@/app/(fotografo)/painel/perfil/mfa-acoes";
import { CampoCodigoEmail } from "@/components/conta/campo-codigo-email";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatar";

const inicial: EstadoMfa = {};

/**
 * Verificação em duas etapas por e-mail em Perfil e recebimento: ligar ou desligar, sempre com o
 * código enviado ao e-mail da conta. Ligada, o login também pede esse código. Saques, transferência
 * automática e troca do CPF/CNPJ pedem o código do e-mail de qualquer jeito.
 */
export function VerificacaoDuasEtapas({
  ativa,
  ativadaEm,
}: {
  ativa: boolean;
  ativadaEm: string | null;
}) {
  const [estado, acao, enviando] = useActionState(verificacaoDuasEtapasAcao, inicial);

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck aria-hidden="true" className="size-5" />
        Verificação em duas etapas
      </h2>
      <p className="text-sm text-muted-foreground">
        Ligada, além da senha (ou do Google), o login pede um código que enviamos para o seu e-mail.
        Quem descobrir sua senha não entra sem acesso ao seu e-mail. Saques, transferência
        automática e troca do CPF/CNPJ já pedem esse código sempre.
      </p>
      <p className="text-sm font-medium">
        {ativa ? `Ligada${ativadaEm ? ` desde ${formatarData(ativadaEm)}` : ""}.` : "Desligada."}
      </p>

      {estado.ok && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {estado.erro}
        </p>
      )}

      <form action={acao} className="flex flex-col gap-3 sm:max-w-md">
        <input type="hidden" name="acao" value={ativa ? "desligar" : "ligar"} />
        <CampoCodigoEmail
          finalidade="verificacao"
          id="codigo-verificacao"
          rotulo={
            ativa
              ? "Para desligar, confirme com o código do e-mail"
              : "Para ligar, confirme com o código do e-mail"
          }
        />
        <Button
          type="submit"
          size="touch"
          variant={ativa ? "outline" : "default"}
          disabled={enviando}
          className="w-fit"
        >
          {enviando && (
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          )}
          {ativa ? "Desligar a verificação" : "Ligar a verificação"}
        </Button>
      </form>
    </section>
  );
}
