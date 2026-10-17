"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Activity, Link2, Loader2, Undo2, Unplug } from "lucide-react";

import {
  alternarArmazenamentoExperimentalAcao,
  desconectarDriveAcao,
  type EstadoAcaoArmazenamento,
  marcarEventoHibridoAcao,
  testarConexaoDriveAcao,
  voltarEventoParaR2Acao,
} from "@/app/(admin)/admin/armazenamento/acoes";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Interruptor } from "@/components/ui/interruptor";
import { Label } from "@/components/ui/label";
import { formatarGb as emGb } from "@/lib/formatar";
import type { ResultadoTesteDrive } from "@/servicos/conexao-drive";

// Peças da tela de Armazenamento da gestão (protótipo do Google Drive). Cada ação confere o
// gestor de novo no servidor; aqui só chegam números e mensagens, nunca ids ou tokens do Drive.

function Mensagem({ estado }: { estado: EstadoAcaoArmazenamento | null }) {
  if (estado?.ok) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {estado.ok}
      </p>
    );
  }
  if (estado?.erro) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {estado.erro}
      </p>
    );
  }
  return null;
}

/** Conectar (link para a rota do OAuth), testar e desconectar a conta do Google Drive. */
export function AcoesConexaoDrive({
  configurado,
  conectado,
}: {
  configurado: boolean;
  conectado: boolean;
}) {
  const [teste, setTeste] = useState<ResultadoTesteDrive | null>(null);
  const [estado, setEstado] = useState<EstadoAcaoArmazenamento | null>(null);
  const [aberto, setAberto] = useState(false);
  const [testando, iniciarTeste] = useTransition();
  const [desconectando, iniciarDesconexao] = useTransition();

  function testar() {
    setEstado(null);
    iniciarTeste(async () => setTeste(await testarConexaoDriveAcao()));
  }

  function desconectar() {
    setTeste(null);
    iniciarDesconexao(async () => {
      setEstado(await desconectarDriveAcao());
      setAberto(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {configurado && (
          // Link comum (não next/link): a rota redireciona para o Google e não pode ser pré-carregada.
          <a
            href="/api/admin/armazenamento/google"
            className={buttonVariants({
              variant: conectado ? "outline" : "default",
              size: "touch",
            })}
          >
            <Link2 aria-hidden="true" />
            {conectado ? "Conectar outra conta" : "Conectar conta Google"}
          </a>
        )}
        {conectado && (
          <>
            <Button size="touch" variant="outline" onClick={testar} disabled={testando}>
              {testando ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Activity aria-hidden="true" />
              )}
              Testar conexão
            </Button>
            <AlertDialog open={aberto} onOpenChange={(abrir) => !desconectando && setAberto(abrir)}>
              <AlertDialogTrigger render={<Button size="touch" variant="destructive" />}>
                <Unplug aria-hidden="true" />
                Desconectar
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desconectar a conta do Google Drive?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O acesso do ClicouAí é revogado no Google. Os originais já gravados no Drive
                    continuam lá, mas ninguém consegue baixá-los até a mesma conta ser conectada de
                    novo. Sem conta conectada, nenhuma foto nova é gravada no Drive.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={desconectando}>Cancelar</AlertDialogCancel>
                  <Button
                    size="touch"
                    onClick={desconectar}
                    disabled={desconectando}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {desconectando && <Loader2 aria-hidden="true" className="animate-spin" />}
                    Sim, desconectar
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
      <div aria-live="polite">
        {teste?.ok === true && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Conexão funcionando: respondeu em {teste.latenciaMs} ms. Espaço usado:{" "}
            {emGb(teste.usadoBytes)}
            {teste.limiteBytes !== null ? ` de ${emGb(teste.limiteBytes)}` : " (sem limite)"}.
            {teste.pastaOk
              ? " Pasta ClicouAI_Storage encontrada."
              : " A pasta ClicouAI_Storage não foi encontrada no Drive."}
          </p>
        )}
        {teste?.ok === false && (
          <p role="alert" className="text-sm text-destructive">
            {teste.erro}
          </p>
        )}
        <Mensagem estado={estado} />
      </div>
    </div>
  );
}

/** Chave do armazenamento experimental. */
export function ChaveExperimental({ ativo }: { ativo: boolean }) {
  const [estado, setEstado] = useState<EstadoAcaoArmazenamento | null>(null);
  const [enviando, iniciar] = useTransition();
  const id = useId();

  function alternar(proximo: boolean) {
    setEstado(null);
    iniciar(async () => setEstado(await alternarArmazenamentoExperimentalAcao(proximo)));
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
        <Interruptor
          id={id}
          checked={ativo}
          disabled={enviando}
          onChange={(e) => alternar(e.target.checked)}
        />
        <span className="font-medium">
          {ativo ? "Desativar armazenamento experimental" : "Ativar armazenamento experimental"}
        </span>
        {enviando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      </label>
      <Mensagem estado={estado} />
    </div>
  );
}

/** Formulário "Marcar evento como híbrido" pelo endereço (slug). */
export function FormularioEventoHibrido() {
  const [estado, acao, enviando] = useActionState<EstadoAcaoArmazenamento, FormData>(
    marcarEventoHibridoAcao,
    {},
  );
  return (
    <form action={acao} className="flex min-w-0 flex-col gap-2 sm:max-w-lg">
      <Label htmlFor="evento-hibrido-slug">Endereço do evento</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="evento-hibrido-slug"
          name="slug"
          placeholder="ex.: meia-maratona-rio-2026"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          required
          className="h-11"
        />
        <Button type="submit" size="touch" disabled={enviando}>
          {enviando && <Loader2 aria-hidden="true" className="animate-spin" />}
          Marcar como híbrido
        </Button>
      </div>
      <Mensagem estado={estado} />
    </form>
  );
}

/** Volta o evento ao R2 (com confirmação). */
export function BotaoVoltarParaR2({ eventoId, titulo }: { eventoId: string; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoAcaoArmazenamento | null>(null);
  const [enviando, iniciar] = useTransition();

  function confirmar() {
    iniciar(async () => {
      const resultado = await voltarEventoParaR2Acao(eventoId);
      setAberto(false);
      if (resultado.erro) setEstado(resultado);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={aberto} onOpenChange={(abrir) => !enviando && setAberto(abrir)}>
        <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
          <Undo2 aria-hidden="true" />
          Voltar ao R2
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar “{titulo}” ao R2?</AlertDialogTitle>
            <AlertDialogDescription>
              As próximas fotos deste evento serão gravadas no R2. As que já estão no Google Drive
              ficam onde estão e continuam sendo entregues a quem comprou.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <Button size="touch" onClick={confirmar} disabled={enviando}>
              {enviando && <Loader2 aria-hidden="true" className="animate-spin" />}
              Sim, voltar ao R2
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Mensagem estado={estado} />
    </div>
  );
}
