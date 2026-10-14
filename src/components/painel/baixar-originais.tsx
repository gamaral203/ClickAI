"use client";

import { useCallback, useId, useState } from "react";
import { AlertTriangle, FolderDown } from "lucide-react";
import { cn } from "cn";

import {
  liberarOriginaisAcao,
  loteDeOriginaisAcao,
} from "@/app/(fotografo)/painel/eventos/originais-acoes";
import { formatarBytes } from "@/lib/formatar";

import { BaixarEmLote } from "./baixar-em-lote";

type Modo = "vendidas" | "minhas";
type Resumo = { quantidade: number; bytes: number; excluidas: number };

const OPCOES: { modo: Modo; titulo: string; descricao: (r: Resumo) => string }[] = [
  {
    modo: "vendidas",
    titulo: "Fotos vendidas",
    descricao: () =>
      "As fotos que você enviou e foram vendidas em pedidos pagos. As dos colaboradores ficam com quem as enviou.",
  },
  {
    modo: "minhas",
    titulo: "Todas as minhas fotos",
    descricao: (r) =>
      r.excluidas > 0
        ? `Tudo o que você enviou, inclusive ${r.excluidas} ${r.excluidas === 1 ? "foto excluída" : "fotos excluídas"} (vão para a pasta "excluidas").`
        : "Tudo o que você enviou a este evento.",
  },
];

/**
 * "Baixar originais" do painel do evento, só para o dono e só das fotos que ele mesmo enviou (o
 * servidor confere de novo em cada lote). Os arquivos vêm direto do R2 por URL assinada; nada
 * passa pelo servidor do site. O download em si fica em BaixarEmLote.
 */
export function BaixarOriginais({
  eventoId,
  slug,
  resumo,
  pedeCodigo,
}: {
  eventoId: string;
  slug: string;
  resumo: Record<Modo, Resumo>;
  pedeCodigo: boolean;
}) {
  const ids = useId();
  const [modo, setModo] = useState<Modo>(resumo.vendidas.quantidade > 0 ? "vendidas" : "minhas");
  const [ocupado, setOcupado] = useState(false);
  const atual = resumo[modo];
  const liberar = useCallback(
    (codigo?: string) => liberarOriginaisAcao(eventoId, codigo),
    [eventoId],
  );
  const lote = useCallback(
    (liberacao: string, pedido: { depois?: string | null; ids?: string[] }) =>
      loteDeOriginaisAcao({ eventoId, modo, liberacao, ...pedido }),
    [eventoId, modo],
  );

  return (
    <section
      aria-labelledby={`${ids}-titulo`}
      className="flex flex-col gap-5 rounded-xl border p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${ids}-titulo`} className="flex items-center gap-2 text-lg font-semibold">
          <FolderDown aria-hidden="true" className="size-5 text-primary" />
          Baixar originais
        </h2>
        <p className="text-sm text-muted-foreground">
          Os arquivos originais das fotos que você enviou, como chegaram. Só o autor baixa o
          original: as fotos dos colaboradores ficam com quem as enviou.
        </p>
      </div>

      <p
        role="note"
        className="flex items-start gap-2 rounded-lg border border-l-4 border-l-highlight bg-muted p-3 text-sm"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        São os originais sem marca d&apos;água. Guarde em lugar seguro e não repasse a quem não
        comprou.
      </p>

      <fieldset disabled={ocupado} className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">O que baixar</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPCOES.map((opcao) => {
            const r = resumo[opcao.modo];
            const escolhida = modo === opcao.modo;
            return (
              <label
                key={opcao.modo}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 motion-reduce:transition-none",
                  escolhida ? "border-primary bg-accent/50" : "hover:border-primary/50",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name={`${ids}-modo`}
                    value={opcao.modo}
                    checked={escolhida}
                    onChange={() => setModo(opcao.modo)}
                    className="size-4 accent-primary"
                  />
                  {opcao.titulo}
                </span>
                <span className="text-sm text-muted-foreground">{opcao.descricao(r)}</span>
                <span className="text-sm font-medium tabular-nums">
                  {r.quantidade} {r.quantidade === 1 ? "arquivo" : "arquivos"}
                  {r.bytes > 0 && <> · cerca de {formatarBytes(r.bytes)}</>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <BaixarEmLote
        chave={modo}
        resumo={atual}
        nomeZip={`${slug}-${modo === "vendidas" ? "vendidas" : "minhas-fotos"}.zip`}
        pedeCodigo={pedeCodigo}
        ajudaCodigo="Sua conta tem a verificação em duas etapas ligada. O código libera o download deste evento por 3 horas."
        liberar={liberar}
        lote={lote}
        aoMudarOcupado={setOcupado}
      />
      {atual.quantidade === 0 && (
        <p className="text-sm text-muted-foreground">
          {modo === "vendidas"
            ? "Nenhuma foto sua deste evento foi vendida ainda."
            : "Você ainda não tem fotos prontas neste evento."}
        </p>
      )}
    </section>
  );
}
