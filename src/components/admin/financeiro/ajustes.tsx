import Link from "next/link";

import { centavosParaCampo } from "@/lib/dinheiro";
import { textoCotacao, textoPb } from "@/lib/financeiro-plataforma";
import { formatarDataCurta, formatarPreco } from "@/lib/formatar";
import { formatarDia } from "@/lib/painel-de-uso";
import type { ConfiguracoesGestao } from "@/dados";

import { FormularioReferencias, FormularioSaldo, ImportarDespesas } from "./formularios";

// Aba Ajustes do Financeiro: saldo informado do Mercado Pago, taxas e cotação de referência e a
// importação das despesas iniciais.

const preco = formatarPreco;

export function Ajustes({ config, hoje }: { config: ConfiguracoesGestao; hoje: string }) {
  return (
    <section aria-labelledby="titulo-config" className="flex flex-col gap-3">
      <h2 id="titulo-config" className="text-xl font-semibold">
        Ajustes
      </h2>
      <details className="rounded-xl border bg-card" open={!config.saldoMp}>
        <summary className="cursor-pointer p-4 font-semibold">
          Saldo informado do Mercado Pago
          {config.saldoMp && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {preco(config.saldoMp.centavos)} em {formatarDia(config.saldoMp.dia)} (salvo em{" "}
              {formatarDataCurta(config.saldoMp.atualizadoEm)})
            </span>
          )}
        </summary>
        <div className="border-t p-4">
          <FormularioSaldo
            valor={config.saldoMp ? centavosParaCampo(config.saldoMp.centavos) : ""}
            dia={config.saldoMp?.dia ?? ""}
            hoje={hoje}
          />
        </div>
      </details>
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer p-4 font-semibold">
          Taxas de referência e cotação
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            Pix {textoPb(config.taxas.pixPb)} · cartão {textoPb(config.taxas.cartaoPb)} · US$ 1 = R${" "}
            {textoCotacao(config.cotacaoDezMilesimos)}
          </span>
        </summary>
        <div className="border-t p-4">
          <FormularioReferencias
            pix={textoPb(config.taxas.pixPb).replace("%", "")}
            cartao={textoPb(config.taxas.cartaoPb).replace("%", "")}
            cotacao={textoCotacao(config.cotacaoDezMilesimos)}
          />
        </div>
      </details>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <p className="font-semibold">Despesas</p>
        <p className="text-sm text-muted-foreground">
          As despesas ficam em{" "}
          <Link href="/admin/uso" className="font-medium text-primary hover:underline">
            Gastos e uso
          </Link>
          ; cada uma tem o histórico de cobranças (botão “Histórico”). Para começar, importe as
          despesas informadas pelos donos:
        </p>
        <ImportarDespesas />
      </div>
    </section>
  );
}
