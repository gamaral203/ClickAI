"use client";

import { useId, useState, useTransition } from "react";
import { Construction, Loader2, Power } from "lucide-react";

import { alternarManutencaoAcao } from "@/app/(admin)/admin/manutencao-acoes";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Mesmo limite do servidor (src/dados/manutencao.ts). */
const MAXIMO = 200;

const VERMELHO =
  "bg-destructive text-white hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/30";

/**
 * Cartão "Modo de manutenção" da Visão geral da gestão (docs/arquitetura.md, "Modo de
 * manutenção"). Só é montado para gestor, e a ação confere de novo no servidor.
 */
export function CartaoManutencao({
  ativa,
  descricao,
  mensagemAtual,
}: {
  ativa: boolean;
  /** "Desligado" ou "Ligado desde 14/10/26 15:30 por Fulano", montado no servidor. */
  descricao: string;
  mensagemAtual: string | null;
}) {
  const [mensagem, setMensagem] = useState("");
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const idCampo = useId();
  const idAjuda = useId();

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await alternarManutencaoAcao({
        ativa: !ativa,
        mensagem: ativa ? null : mensagem,
      });
      if (resultado.erro) {
        setErro(resultado.erro);
        setAberto(false);
        return;
      }
      setMensagem("");
      setAberto(false);
    });
  }

  return (
    <section
      aria-labelledby="titulo-manutencao"
      className={`flex flex-col gap-4 rounded-xl border p-4 sm:p-5 ${ativa ? "border-destructive/50 bg-destructive/5" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${ativa ? "bg-destructive text-white" : "bg-muted text-muted-foreground"}`}
          >
            <Construction className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="titulo-manutencao" className="text-base font-semibold sm:text-lg">
              Modo de manutenção
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <span className={ativa ? "font-semibold text-destructive" : "font-medium"}>
                {descricao}
              </span>
              {ativa
                ? ". Clientes e fotógrafos estão vendo a tela de manutenção; só gestores usam o site."
                : ". Ao ligar, só os gestores continuam usando o site."}
            </p>
            {ativa && mensagemAtual && (
              <p className="mt-1 text-sm break-words">
                <span className="text-muted-foreground">Mensagem para o público:</span>{" "}
                {mensagemAtual}
              </p>
            )}
          </div>
        </div>
      </div>

      {!ativa && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idCampo} className="text-sm font-medium">
            Mensagem para o público <span className="text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id={idCampo}
            aria-describedby={idAjuda}
            value={mensagem}
            maxLength={MAXIMO}
            rows={2}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Ex.: Estamos lançando a busca por vídeo. Voltamos às 15h."
            className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
          <span id={idAjuda} className="text-xs text-muted-foreground">
            Aparece na tela de manutenção. {mensagem.length}/{MAXIMO} caracteres.
          </span>
        </div>
      )}

      <AlertDialog open={aberto} onOpenChange={(abrir) => !enviando && setAberto(abrir)}>
        <AlertDialogTrigger
          render={
            <Button
              size="touch"
              variant={ativa ? "outline" : "default"}
              className={`self-start ${ativa ? "" : VERMELHO}`}
            />
          }
        >
          <Power aria-hidden="true" />
          {ativa ? "Desativar manutenção" : "Ativar manutenção"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ativa
                ? "Desativar a manutenção e reabrir o site?"
                : "Você tem certeza que deseja ativar a tela de manutenção?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ativa
                ? "Clientes e fotógrafos voltam a usar o site normalmente."
                : "Clientes, fotógrafos e visitantes deixam de acessar o site e passam a ver só a tela de “Estamos em manutenção”. Compras, envios de fotos e saques ficam parados. Só os gestores continuam vendo o site normalmente. Pagamentos já feitos continuam sendo confirmados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <Button
              size="touch"
              onClick={confirmar}
              disabled={enviando}
              className={ativa ? "" : VERMELHO}
            >
              {enviando && <Loader2 aria-hidden="true" className="animate-spin" />}
              {ativa ? "Sim, reabrir o site" : "Sim, ativar manutenção"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}
