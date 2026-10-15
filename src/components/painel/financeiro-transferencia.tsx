"use client";

import { useActionState, useId, useOptimistic, useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Loader2, Send } from "lucide-react";

import {
  salvarTransferenciaAutomaticaAcao,
  solicitarSaqueAcao,
  type EstadoSaque,
} from "@/app/(fotografo)/painel/vendas/acoes";
import { InterruptorFinanceiro } from "@/components/painel/financeiro-interruptor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FrequenciaTransferencia } from "@/dados";
import { formatarData, formatarPreco } from "@/lib/formatar";
import { FREQUENCIAS_TRANSFERENCIA, TAXA_ANTECIPACAO_TEXTO } from "@/servicos/financeiro";

const ROTULO_FREQUENCIA: Record<
  FrequenciaTransferencia,
  { nome: string; texto: string; primeira: string }
> = {
  diaria: { nome: "Diária", texto: "todo dia", primeira: "1 dia" },
  semanal: { nome: "Semanal", texto: "a cada 7 dias", primeira: "7 dias" },
  mensal: { nome: "Mensal", texto: "a cada 30 dias", primeira: "30 dias" },
};

/** O mesmo texto nas duas formas de transferir: quem faz o Pix, em quanto tempo e para onde. */
const COMO_SAI =
  "A equipe do ClicouAí faz o Pix em até 1 dia útil para a sua chave Pix (CPF/CNPJ). Sem tarifa.";

type Previa = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxaAntecipacaoCentavos: number;
  liquidoCentavos: number;
};

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 ${forte ? "font-semibold" : "text-muted-foreground"}`}
    >
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}

function CampoCodigo({ id }: { id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Código do app autenticador</Label>
      <Input
        id={id}
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={40}
        className="h-11 tracking-widest"
      />
    </div>
  );
}

const inicial: EstadoSaque = {};

/** Transferência manual: todo o saldo disponível, com o detalhamento do que vai cair. */
function TransferenciaManual({
  previa,
  comissaoPct,
  liberado,
  pedeCodigo,
}: {
  previa: Previa;
  comissaoPct: number;
  liberado: boolean;
  pedeCodigo: boolean;
}) {
  const [estado, acao, enviando] = useActionState(solicitarSaqueAcao, inicial);
  const codigoId = useId();
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <Send aria-hidden="true" className="size-4 text-primary" />
        Transferir agora
      </h3>
      <dl className="flex flex-col gap-1 text-sm">
        <Linha rotulo="Vendas disponíveis" valor={formatarPreco(previa.brutoCentavos)} />
        <Linha
          rotulo={`Comissão ClicouAí (${comissaoPct}%)`}
          valor={`− ${formatarPreco(previa.comissaoCentavos)}`}
        />
        {previa.taxaAntecipacaoCentavos > 0 && (
          <Linha
            rotulo={`Antecipação do cartão (${TAXA_ANTECIPACAO_TEXTO})`}
            valor={`− ${formatarPreco(previa.taxaAntecipacaoCentavos)}`}
          />
        )}
        <Linha rotulo="Tarifa de transferência" valor={formatarPreco(0)} />
        <div className="mt-1 border-t pt-2">
          <Linha rotulo="Cai na sua conta" valor={formatarPreco(previa.liquidoCentavos)} forte />
        </div>
      </dl>
      {pedeCodigo && liberado && <CampoCodigo id={codigoId} />}
      <Button type="submit" size="touch" disabled={!liberado || enviando}>
        {enviando && (
          <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
        )}
        Transferir {formatarPreco(previa.liquidoCentavos)}
      </Button>
      <p className="text-xs text-muted-foreground">{COMO_SAI}</p>
      {estado.ok && (
        <p role="status" className="flex items-start gap-1.5 text-sm text-primary">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
    </form>
  );
}

/**
 * Transferência automática. Ligar pede a frequência (e o código do app, com a verificação em duas
 * etapas) num passo de confirmação; desligar e trocar a frequência de uma já ligada salvam na hora.
 */
function TransferenciaAutomatica({
  ligada,
  frequencia,
  proximaEm,
  pedeCodigo,
}: {
  ligada: boolean;
  frequencia: FrequenciaTransferencia;
  /** Próxima data prevista (ISO), com ela ligada. */
  proximaEm: string | null;
  pedeCodigo: boolean;
}) {
  const rotuloId = useId();
  const descricaoId = useId();
  const codigoId = useId();
  const [salvo, mudarOtimista] = useOptimistic({ ligada, frequencia });
  // Passo de ativação aberto (ainda não salvo) e a frequência escolhida nele.
  const [ativando, setAtivando] = useState(false);
  const [escolhida, setEscolhida] = useState(frequencia);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  function salvar(
    config: { ligada: boolean; frequencia: FrequenciaTransferencia },
    codigo?: string,
  ) {
    setErro(null);
    startTransition(async () => {
      mudarOtimista(config);
      const r = await salvarTransferenciaAutomaticaAcao({ ...config, codigo }).catch(() => ({
        erro: "Não foi possível salvar. Tente de novo.",
      }));
      if (r.erro) setErro(r.erro);
      else setAtivando(false);
    });
  }

  function alternar(novo: boolean) {
    setErro(null);
    if (novo) {
      setEscolhida(salvo.frequencia);
      setAtivando(true);
    } else if (ativando) {
      setAtivando(false);
    } else {
      salvar({ ligada: false, frequencia: salvo.frequencia });
    }
  }

  // Ligada: a frequência muda na hora. No passo de ativação: só muda a escolha.
  const frequenciaAtual = salvo.ligada ? salvo.frequencia : escolhida;
  function escolher(f: FrequenciaTransferencia) {
    if (salvo.ligada) {
      if (f !== salvo.frequencia) salvar({ ligada: true, frequencia: f });
    } else {
      setEscolhida(f);
    }
  }

  const mostrarOpcoes = salvo.ligada || ativando;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 id={rotuloId} className="flex items-center gap-2 font-semibold">
            <CalendarClock aria-hidden="true" className="size-4 text-primary" />
            Ativar transferência automática
          </h3>
          <p id={descricaoId} className="text-sm text-muted-foreground">
            O pedido de transferência do saldo disponível é criado automaticamente; a equipe do
            ClicouAí faz o Pix em até 1 dia útil para a sua chave Pix (CPF/CNPJ). Sem tarifa.
          </p>
        </div>
        <InterruptorFinanceiro
          ligado={salvo.ligada || ativando}
          aoMudar={alternar}
          rotuloId={rotuloId}
          descricaoId={descricaoId}
          desabilitado={salvando}
        />
      </div>

      {mostrarOpcoes && (
        <fieldset className="flex flex-col gap-2" disabled={salvando}>
          <legend className="mb-2 text-sm font-medium">Frequência</legend>
          <div className="grid grid-cols-3 gap-2">
            {FREQUENCIAS_TRANSFERENCIA.map((f) => (
              <label
                key={f}
                className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2 text-center text-sm transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name={`frequencia-${rotuloId}`}
                  value={f}
                  checked={frequenciaAtual === f}
                  onChange={() => escolher(f)}
                  className="sr-only"
                />
                <span className="font-medium">{ROTULO_FREQUENCIA[f].nome}</span>
                <span className="text-xs opacity-80">{ROTULO_FREQUENCIA[f].texto}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {salvo.ligada && !salvando && proximaEm && (
        <p className="text-sm">
          Próxima transferência prevista: <strong>{formatarData(proximaEm)}</strong>. Sai com o
          saldo disponível nesse dia, se for de pelo menos R$ 1,00.
        </p>
      )}

      {ativando && !salvo.ligada && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const codigo = new FormData(e.currentTarget).get("codigo");
            salvar(
              { ligada: true, frequencia: escolhida },
              typeof codigo === "string" ? codigo : undefined,
            );
          }}
        >
          <p className="text-sm text-muted-foreground">
            A primeira sai {ROTULO_FREQUENCIA[escolhida].primeira} depois de ativar, com o saldo
            disponível nesse dia.
          </p>
          {pedeCodigo && <CampoCodigo id={codigoId} />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="touch" disabled={salvando}>
              {salvando && (
                <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
              )}
              Ativar transferência {ROTULO_FREQUENCIA[escolhida].nome.toLowerCase()}
            </Button>
            <Button
              type="button"
              size="touch"
              variant="outline"
              disabled={salvando}
              onClick={() => setAtivando(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Seção "Transferência de saldo": manual e automática lado a lado no computador. */
export function TransferenciaFinanceiro({
  previa,
  comissaoPct,
  podeTransferir,
  minimoCentavos,
  pedeCodigo,
  automatica,
}: {
  previa: Previa;
  comissaoPct: number;
  /** Tem chave Pix confirmada, nenhum saque em andamento, sem bloqueio e não é demonstração. */
  podeTransferir: boolean;
  minimoCentavos: number;
  /** Verificação em duas etapas ligada: a transferência manual e ligar a automática pedem o código. */
  pedeCodigo: boolean;
  automatica: {
    ligada: boolean;
    frequencia: FrequenciaTransferencia;
    proximaEm: string | null;
  };
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <TransferenciaManual
        previa={previa}
        comissaoPct={comissaoPct}
        liberado={podeTransferir && previa.liquidoCentavos >= minimoCentavos}
        pedeCodigo={pedeCodigo}
      />
      <TransferenciaAutomatica {...automatica} pedeCodigo={pedeCodigo} />
    </div>
  );
}
