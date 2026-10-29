import Link from "next/link";

import { formatarPreco as preco } from "@/lib/formatar";
import { formatarDia } from "@/lib/painel-de-uso";
import type { PainelFinanceiro } from "@/servicos/financeiro-plataforma";

import { hrefFinanceiro } from "./abas";

/** Uma linha de conta: rótulo à esquerda, valor à direita e uma nota opcional embaixo. */
export function Linha({
  rotulo,
  valor,
  forte,
  nota,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  nota?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-0.5 py-2 ${forte ? "font-semibold" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0">{rotulo}</dt>
        <dd className="text-right whitespace-nowrap tabular-nums">{valor}</dd>
      </div>
      {nota && <p className="text-xs font-normal text-muted-foreground">{nota}</p>}
    </div>
  );
}

/**
 * Aba Conciliação: primeiro o que importa (deveria ter / tem / diferença), numa coluna; o
 * detalhamento do calculado e de quem é o dinheiro fica embaixo.
 */
export function Conciliacao({ painel, hoje }: { painel: PainelFinanceiro; hoje: string }) {
  const c = painel.conciliacao;
  const ate = c.saldoInformado ? formatarDia(c.saldoInformado.dia) : "agora";
  return (
    <section aria-labelledby="titulo-conciliacao" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="titulo-conciliacao" className="text-xl font-semibold">
          Conciliação com o saldo do Mercado Pago
        </h2>
        <p className="text-sm text-muted-foreground">
          Do início até o fim do dia do saldo informado ({ate}). Hoje: {formatarDia(hoje)}.
        </p>
      </div>

      <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
        <Linha
          rotulo="Deveria ter (calculado)"
          valor={preco(c.saldoCalculadoCentavos)}
          forte
          nota="Entradas líquidas − saques − despesas pagas com o saldo do MP (detalhe abaixo)."
        />
        <Linha
          rotulo="Tem (informado)"
          valor={c.saldoInformado ? preco(c.saldoInformado.centavos) : "não informado"}
          nota={
            c.saldoInformado ? (
              `Informado à mão para ${formatarDia(c.saldoInformado.dia)}.`
            ) : (
              <>
                Informe o saldo em{" "}
                <Link
                  href={hrefFinanceiro("ajustes")}
                  className="font-medium text-primary hover:underline"
                >
                  Ajustes
                </Link>
                .
              </>
            )
          }
        />
        <Linha
          rotulo="Diferença não justificada"
          valor={c.diferencaCentavos === null ? "—" : preco(c.diferencaCentavos)}
          forte
          nota={
            c.diferencaCentavos === null
              ? "Informe o saldo para comparar."
              : "Informado − calculado. Taxas estimadas, saques manuais fora do Payouts ou despesas não lançadas explicam diferenças."
          }
        />
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Como o calculado é formado</h3>
        <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
          <Linha
            rotulo={`Entradas líquidas até ${ate}`}
            valor={preco(c.entradasLiquidasCentavos)}
            nota="Pedidos pagos, menos a taxa do Mercado Pago (real ou estimada). Estornados e contestados fora."
          />
          <Linha rotulo="(−) Saques pagos aos fotógrafos" valor={preco(c.saquesPagosCentavos)} />
          <Linha
            rotulo="(−) Saques em processamento"
            valor={preco(c.saquesProcessandoCentavos)}
            nota="Podem ainda não ter saído da conta."
          />
          <Linha
            rotulo="(−) Despesas pagas com o saldo do MP"
            valor={preco(c.despesasPagasSaldoCentavos)}
          />
          <Linha
            rotulo="= Saldo conciliado (calculado)"
            valor={preco(c.saldoCalculadoCentavos)}
            forte
          />
        </dl>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">De quem é o dinheiro do saldo</h3>
        <dl className="flex flex-col divide-y rounded-xl border bg-card px-4 text-sm">
          <Linha
            rotulo="Dos fotógrafos (a sacar)"
            valor={preco(c.aSacarFotografosCentavos)}
            nota="Vendas sem saque, menos a comissão que o saque cobrará (estimada)."
          />
          <Linha rotulo="Da plataforma" valor={preco(c.saldoDaPlataformaCentavos)} forte />
          <Linha
            rotulo={`Receita líquida acumulada até ${ate}`}
            valor={preco(painel.acumulado.receitaLiquidaCentavos)}
          />
          <Linha
            rotulo="Despesas pagas acumuladas (todas as formas)"
            valor={preco(painel.acumulado.despesasPagasCentavos)}
            nota="As pagas no cartão não saem do saldo do Mercado Pago."
          />
          <Linha
            rotulo="Reservas no saldo do MP (não subtraídas)"
            valor={preco(c.despesasReservadasSaldoCentavos)}
            nota="Pendentes, previstas e provisionadas marcadas para o saldo. Nunca misturadas com o pago."
          />
          <Linha
            rotulo="Saldo calculado após as reservas"
            valor={preco(c.saldoAposReservasCentavos)}
          />
        </dl>
      </div>
    </section>
  );
}
