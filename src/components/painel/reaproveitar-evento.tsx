"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, CopyPlus, Loader2 } from "lucide-react";

import { duplicarEventoAcao, salvarModeloAcao } from "@/app/(fotografo)/painel/eventos/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Reaproveitar a configuração deste evento: duplicar (cria um rascunho igual, com descontos e
 * pacote) ou salvar como modelo para os próximos eventos.
 */
export function ReaproveitarEvento({ eventoId, titulo }: { eventoId: string; titulo: string }) {
  const [nome, setNome] = useState(titulo);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [duplicando, startDuplicar] = useTransition();
  const [salvando, startSalvar] = useTransition();

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Reaproveitar este evento</h2>
        <p className="text-sm text-muted-foreground">
          Evento parecido vem aí? Duplique para começar com tudo pronto, ou salve a configuração
          (preços, local, visibilidade, liberação e filtros) como modelo para usar em Novo evento.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Button
          variant="outline"
          size="touch"
          disabled={duplicando}
          onClick={() =>
            startDuplicar(async () => {
              setAviso(null);
              const resultado = await duplicarEventoAcao(eventoId);
              // Sem erro, a ação já levou para o evento novo.
              if (resultado?.erro) setAviso({ tipo: "erro", texto: resultado.erro });
            })
          }
        >
          {duplicando ? (
            <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <CopyPlus aria-hidden="true" data-icon="inline-start" />
          )}
          Duplicar evento
        </Button>
        <form
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            startSalvar(async () => {
              setAviso(null);
              const resultado = await salvarModeloAcao(eventoId, nome);
              setAviso(
                resultado.erro
                  ? { tipo: "erro", texto: resultado.erro }
                  : { tipo: "ok", texto: "Modelo salvo. Ele aparece em Novo evento." },
              );
            });
          }}
        >
          <label className="flex flex-1 flex-col gap-2 text-sm font-medium">
            Nome do modelo
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              className="h-11"
            />
          </label>
          <Button type="submit" variant="outline" size="touch" disabled={salvando}>
            {salvando ? (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <BookmarkPlus aria-hidden="true" data-icon="inline-start" />
            )}
            Salvar como modelo
          </Button>
        </form>
      </div>
      {aviso && (
        <p
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className={aviso.tipo === "erro" ? "text-sm text-destructive" : "text-sm text-primary"}
        >
          {aviso.texto}
        </p>
      )}
    </section>
  );
}
