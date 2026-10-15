"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { CreditCard, QrCode } from "lucide-react";

import { salvarAntecipacaoAcao } from "@/app/(fotografo)/painel/vendas/acoes";
import { InterruptorFinanceiro } from "@/components/painel/financeiro-interruptor";
import { formatarPreco } from "@/lib/formatar";
import { comissaoDe, taxaAntecipacaoDe, TAXA_ANTECIPACAO_TEXTO } from "@/servicos/financeiro";

/** Venda de exemplo do texto: R$ 100,00 no cartão. */
const EXEMPLO_CENTAVOS = 10_000;

/**
 * "Configurações de antecipação": o interruptor da liberação antecipada do cartão e o texto que
 * explica prazo e taxa sem letra miúda. O exemplo usa as mesmas funções do saque, então o número
 * mostrado é o que cai de verdade.
 */
export function AntecipacaoFinanceiro({
  ligado,
  comissaoPct,
  antecipavelCentavos,
  antecipavelLiquidoCentavos,
}: {
  ligado: boolean;
  comissaoPct: number;
  /** Cartão entre 1 e 30 dias que entraria no saldo se a antecipação fosse ligada agora. */
  antecipavelCentavos: number;
  antecipavelLiquidoCentavos: number;
}) {
  const rotuloId = useId();
  const descricaoId = useId();
  // Mostra a mudança na hora; quando a página revalida, o valor salvo volta pelas props (ou o
  // antigo, se falhou).
  const [valor, mudarOtimista] = useOptimistic(ligado);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  function mudar(novo: boolean) {
    setErro(null);
    startTransition(async () => {
      mudarOtimista(novo);
      const r = await salvarAntecipacaoAcao(novo).catch(() => ({
        erro: "Não foi possível salvar. Tente de novo.",
      }));
      if (r.erro) setErro(r.erro);
    });
  }

  const comissao = comissaoDe(EXEMPLO_CENTAVOS, comissaoPct);
  const antecipacao = taxaAntecipacaoDe(EXEMPLO_CENTAVOS);

  return (
    <section
      aria-labelledby={`${rotuloId}-secao`}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id={`${rotuloId}-secao`} className="text-xl font-semibold">
        Configurações de antecipação
      </h2>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id={rotuloId} className="font-medium">
            Antecipar automaticamente vendas no cartão de crédito
          </span>
          <span id={descricaoId} className="text-sm text-muted-foreground">
            {valor
              ? `Ligado: o cartão fica disponível 1 dia depois da venda, com ${TAXA_ANTECIPACAO_TEXTO} sobre o valor da venda.`
              : "Desligado: o cartão fica disponível 30 dias depois da venda, sem taxa."}
          </span>
        </div>
        <InterruptorFinanceiro
          ligado={valor}
          aoMudar={mudar}
          rotuloId={rotuloId}
          descricaoId={descricaoId}
          desabilitado={salvando}
        />
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {!valor && antecipavelCentavos > 0 && (
        <p className="rounded-lg bg-accent/60 p-3 text-sm text-accent-foreground">
          Você tem {formatarPreco(antecipavelCentavos)} em vendas no cartão esperando os 30 dias.
          Ligando agora, {formatarPreco(antecipavelLiquidoCentavos)} entram no saldo disponível.
        </p>
      )}

      {/* Prazos lado a lado: Pix e cartão nunca se confundem. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <QrCode aria-hidden="true" className="size-4 text-primary" />
            Vendas no Pix
          </span>
          <span className="text-muted-foreground">
            Disponíveis 1 dia depois do pagamento, <strong>sem taxa</strong>. O Pix nunca paga
            antecipação, com o interruptor ligado ou não.
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <CreditCard aria-hidden="true" className="size-4 text-primary" />
            Vendas no cartão
          </span>
          <span className="text-muted-foreground">
            Desligado: disponíveis em 30 dias, sem taxa. Ligado: em 1 dia, com{" "}
            <strong>{TAXA_ANTECIPACAO_TEXTO}</strong> sobre o valor da venda.
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-sm">
        <span className="font-medium">
          Exemplo: venda de {formatarPreco(EXEMPLO_CENTAVOS)} no cartão, antecipada
        </span>
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Comissão ClicouAí ({comissaoPct}%)</dt>
            <dd className="tabular-nums">− {formatarPreco(comissao)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Antecipação ({TAXA_ANTECIPACAO_TEXTO})</dt>
            <dd className="tabular-nums">− {formatarPreco(antecipacao)}</dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <dt>Você recebe em 1 dia</dt>
            <dd className="tabular-nums">
              {formatarPreco(EXEMPLO_CENTAVOS - comissao - antecipacao)}
            </dd>
          </div>
        </dl>
        <span className="text-muted-foreground">
          Sem antecipar, a mesma venda rende {formatarPreco(EXEMPLO_CENTAVOS - comissao)} em 30
          dias.
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Como funciona: o cliente paga na conta do ClicouAí. A antecipação é uma{" "}
        <strong>liberação antecipada feita pelo próprio ClicouAí</strong>, não uma antecipação do
        Mercado Pago nem um empréstimo. A taxa só é cobrada sobre vendas no cartão transferidas
        antes dos 30 dias, e a configuração vale para todo o cartão ainda não transferido a partir
        da próxima transferência.
      </p>
    </section>
  );
}
