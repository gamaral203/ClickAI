"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";

import { enviarCodigoDeAcaoAcao } from "@/app/codigo-acao-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FinalidadeDoCodigo } from "@/servicos/codigo-acao";

/**
 * Campo do código de confirmação por e-mail das ações sensíveis (src/servicos/codigo-acao.ts):
 * "Enviar código" manda o código para o e-mail da conta e o campo recebe os 6 números, que vão
 * com o formulário (no `name` dado). Substituiu o campo do app autenticador.
 */
export function CampoCodigoEmail({
  finalidade,
  id,
  name = "codigo",
  rotulo = "Código enviado para o seu e-mail",
  erro,
  obrigatorio = true,
  valor,
  aoMudar,
  enviarAoMostrar = false,
}: {
  finalidade: FinalidadeDoCodigo;
  id: string;
  name?: string;
  rotulo?: string;
  erro?: string;
  obrigatorio?: boolean;
  /** Campo controlado (quem usa guarda o código no próprio estado, sem formulário). */
  valor?: string;
  aoMudar?: (valor: string) => void;
  /** Manda o código assim que o campo aparece (quando ele só surge depois de o servidor pedir). */
  enviarAoMostrar?: boolean;
}) {
  const [enviando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [espera, setEspera] = useState(0);

  // Contagem do "Reenviar" (o servidor não manda outro em menos de 30 segundos).
  useEffect(() => {
    if (espera <= 0) return;
    const t = window.setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [espera]);

  // Envio automático, uma vez, quando o campo aparece já pedindo o código.
  const enviouSozinho = useRef(false);
  useEffect(() => {
    if (!enviarAoMostrar || enviouSozinho.current) return;
    enviouSozinho.current = true;
    enviar();
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enviar() {
    iniciar(async () => {
      const r = await enviarCodigoDeAcaoAcao(finalidade);
      setAviso(r.ok ? { texto: r.mensagem, erro: false } : { texto: r.erro, erro: true });
      if (r.esperaS) setEspera(r.esperaS);
    });
  }

  const idAviso = `${id}-aviso`;
  const idErro = `${id}-erro`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          required={obrigatorio}
          maxLength={8}
          placeholder="000000"
          {...(aoMudar ? { value: valor ?? "", onChange: (e) => aoMudar(e.target.value) } : {})}
          aria-invalid={Boolean(erro)}
          aria-describedby={
            [aviso ? idAviso : "", erro ? idErro : ""].join(" ").trim() || undefined
          }
          className="h-11 min-w-0 flex-1 tracking-widest"
        />
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={enviar}
          disabled={enviando || espera > 0}
          className="shrink-0"
        >
          {enviando ? (
            <Loader2
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Mail aria-hidden="true" className="size-4" />
          )}
          {espera > 0
            ? `Reenviar (${espera}s)`
            : aviso && !aviso.erro
              ? "Reenviar"
              : "Enviar código"}
        </Button>
      </div>
      {aviso && (
        <p
          id={idAviso}
          role="status"
          className={aviso.erro ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {aviso.texto}
        </p>
      )}
      {erro && (
        <p id={idErro} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
