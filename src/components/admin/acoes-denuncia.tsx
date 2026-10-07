"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { moderarAcao } from "@/app/(admin)/admin/denuncias/acoes";
import { Button } from "@/components/ui/button";

type Acao = "analisar" | "analisar_e_tirar_do_ar" | "procedente" | "improcedente";

const CONFIRMACOES: Partial<Record<Acao, string>> = {
  procedente: "Marcar como procedente? O conteúdo sai do ar e as partes são avisadas.",
  improcedente: "Marcar como improcedente? Quem denunciou é avisado.",
};

export function AcoesDenuncia({
  id,
  status,
  alvoTipo,
  eventoNoAr,
}: {
  id: string;
  status: "recebida" | "em_analise";
  alvoTipo: "evento" | "foto";
  eventoNoAr: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar(acao: Acao) {
    setErro(null);
    setConfirmando(null);
    startTransition(async () => {
      const resultado = await moderarAcao(id, acao).catch(() => ({
        ok: false as const,
        erro: "Não foi possível concluir.",
      }));
      if (!resultado.ok) setErro(resultado.erro);
      router.refresh();
    });
  }

  function pedir(acao: Acao) {
    if (CONFIRMACOES[acao]) setConfirmando(acao);
    else executar(acao);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <h2 className="font-semibold">Decisão</h2>
      {status === "recebida" && (
        <>
          <Button
            variant="outline"
            size="touch"
            disabled={pendente}
            onClick={() => pedir("analisar")}
          >
            Começar a análise
          </Button>
          {eventoNoAr && (
            <Button
              variant="outline"
              size="touch"
              disabled={pendente}
              onClick={() => pedir("analisar_e_tirar_do_ar")}
            >
              Analisar e tirar o evento do ar
            </Button>
          )}
        </>
      )}
      <Button size="touch" disabled={pendente} onClick={() => pedir("procedente")}>
        {alvoTipo === "foto" ? "Procedente: remover a foto" : "Procedente: tirar o evento do ar"}
      </Button>
      <Button
        variant="outline"
        size="touch"
        disabled={pendente}
        onClick={() => pedir("improcedente")}
      >
        Improcedente
      </Button>
      {confirmando && (
        <div className="flex flex-col gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          <p>{CONFIRMACOES[confirmando]}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => executar(confirmando)}>
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {pendente && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Salvando…
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
