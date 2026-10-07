"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";

import {
  atualizarColaboradorAcao,
  convidarColaboradorAcao,
  removerColaboradorAcao,
  type EstadoColaborador,
} from "@/app/(fotografo)/painel/eventos/vendas-acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AvisoSalvo, Campo, propsDeErro } from "./campos";

export type ColaboradorNaTela = {
  id: string;
  nomePublico: string;
  comissaoDonoPct: number;
  nota: string | null;
  totalItens: number;
};

const inicial: EstadoColaborador = {};

/**
 * Fotógrafos que enviam fotos a este evento. Cada um recebe pelas fotos que enviou, menos a
 * comissão do dono do evento.
 */
export function Colaboradores({
  eventoId,
  colaboradores,
}: {
  eventoId: string;
  colaboradores: ColaboradorNaTela[];
}) {
  const [estado, acao, enviando] = useActionState(convidarColaboradorAcao, inicial);
  const [versao, setVersao] = useState(0);
  const erros = estado.erros ?? {};

  return (
    <div className="flex flex-col gap-5">
      {colaboradores.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Só você envia fotos para este evento.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {colaboradores.map((c) => (
            <LinhaColaborador key={c.id} colaborador={c} />
          ))}
        </ul>
      )}

      <form
        key={versao}
        action={acao}
        noValidate
        className="flex flex-col gap-4 rounded-lg border p-4"
      >
        <h3 className="flex items-center gap-2 font-semibold">
          <UserPlus aria-hidden="true" className="size-5" />
          Adicionar colaborador
        </h3>
        {estado.ok && (
          <AvisoSalvo>
            Colaborador adicionado. O evento aparece para ele em Colaborações, no painel.
          </AvisoSalvo>
        )}
        <input type="hidden" name="eventoId" value={eventoId} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Campo
            rotulo="E-mail da conta do fotógrafo"
            id="colab-email"
            erro={erros.email}
            ajuda="Ele precisa ter conta de vendedor no ClicouAí."
          >
            <Input
              {...propsDeErro("colab-email", erros.email)}
              name="email"
              type="email"
              autoComplete="off"
              className="h-11"
            />
          </Campo>
          <Campo
            rotulo="Sua comissão (%)"
            id="colab-comissao"
            erro={erros.comissaoDonoPct}
            ajuda="Sobre cada venda das fotos dele."
          >
            <Input
              {...propsDeErro("colab-comissao", erros.comissaoDonoPct)}
              name="comissaoDonoPct"
              inputMode="numeric"
              defaultValue="30"
              className="h-11"
            />
          </Campo>
        </div>
        <Campo rotulo="Nota (opcional, só você vê)" id="colab-nota" erro={erros.nota}>
          <Input
            {...propsDeErro("colab-nota", erros.nota)}
            name="nota"
            maxLength={200}
            placeholder="Ex.: cobre a chegada"
            className="h-11"
          />
        </Campo>
        <div className="flex gap-2">
          <Button type="submit" size="touch" disabled={enviando}>
            {enviando && (
              <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            )}
            Adicionar
          </Button>
          {estado.ok && (
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => setVersao((v) => v + 1)}
            >
              Limpar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function LinhaColaborador({ colaborador }: { colaborador: ColaboradorNaTela }) {
  const router = useRouter();
  const [comissao, setComissao] = useState(String(colaborador.comissaoDonoPct));
  const [nota, setNota] = useState(colaborador.nota ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();
  const mudou =
    comissao !== String(colaborador.comissaoDonoPct) || nota !== (colaborador.nota ?? "");

  function executar(acao: () => Promise<{ erro?: string }>, aoConcluir?: () => void) {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const resultado = await acao().catch(() => ({ erro: "Não foi possível concluir." }));
      if (resultado.erro) return setErro(resultado.erro);
      aoConcluir?.();
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{colaborador.nomePublico}</p>
        <p className="text-sm text-muted-foreground">
          {colaborador.totalItens}{" "}
          {colaborador.totalItens === 1 ? "foto enviada" : "fotos enviadas"}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`com-${colaborador.id}`} className="text-sm font-medium">
            Sua comissão (%)
          </label>
          <Input
            id={`com-${colaborador.id}`}
            inputMode="numeric"
            value={comissao}
            onChange={(e) => setComissao(e.target.value)}
            className="h-11 w-24"
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor={`nota-${colaborador.id}`} className="text-sm font-medium">
            Nota
          </label>
          <Input
            id={`nota-${colaborador.id}`}
            value={nota}
            maxLength={200}
            onChange={(e) => setNota(e.target.value)}
            className="h-11"
          />
        </div>
        <Button
          variant="outline"
          size="touch"
          disabled={!mudou || pendente}
          onClick={() =>
            executar(
              () => atualizarColaboradorAcao(colaborador.id, { comissaoDonoPct: comissao, nota }),
              () => setSalvo(true),
            )
          }
        >
          Salvar
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={`Remover ${colaborador.nomePublico}`}
          disabled={pendente}
          onClick={() => executar(() => removerColaboradorAcao(colaborador.id))}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      {salvo && (
        <p className="text-sm text-muted-foreground">Salvo. Vale para as próximas vendas.</p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </li>
  );
}
