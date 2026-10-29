"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";

import {
  importarDespesasIniciaisAcao,
  salvarReferenciasAcao,
  salvarSaldoAcao,
  type EstadoImportacao,
  type EstadoReferencias,
  type EstadoSaldo,
} from "@/app/(admin)/admin/uso/financeiro/acoes";
import { AvisoSalvo, Campo, propsDeErro } from "@/components/painel/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enviarSemLimpar } from "@/lib/formulario";

// Formulários do Financeiro da ClicouAí: saldo informado do Mercado Pago, taxas de referência e
// cotação, e a importação das despesas iniciais.

/** Saldo da conta do Mercado Pago, digitado à mão, com o dia (referência da conciliação). */
export function FormularioSaldo({
  valor,
  dia,
  hoje,
}: {
  valor: string;
  dia: string;
  hoje: string;
}) {
  const [estado, acao, salvando] = useActionState(salvarSaldoAcao, {} as EstadoSaldo);
  const erros = estado.erros ?? {};
  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Saldo na conta do Mercado Pago (R$)"
          id="saldo-valor"
          erro={erros.valor}
          ajuda="Copie do app do Mercado Pago: é o caixa, não a receita."
        >
          <Input
            {...propsDeErro("saldo-valor", erros.valor)}
            name="valor"
            defaultValue={valor}
            inputMode="decimal"
            placeholder="477,00"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
        <Campo rotulo="Dia do saldo" id="saldo-dia" erro={erros.dia}>
          <Input
            {...propsDeErro("saldo-dia", erros.dia)}
            name="dia"
            type="date"
            defaultValue={dia || hoje}
            max={hoje}
            className="h-11"
          />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="touch" variant="outline" disabled={salvando}>
          {salvando && <Loader2 aria-hidden="true" className="animate-spin" />}
          Salvar saldo informado
        </Button>
        {estado.ok && <AvisoSalvo>Saldo salvo.</AvisoSalvo>}
      </div>
    </form>
  );
}

/** Taxas de referência do Mercado Pago e cotação do dólar com 4 casas. */
export function FormularioReferencias({
  pix,
  cartao,
  cotacao,
}: {
  pix: string;
  cartao: string;
  cotacao: string;
}) {
  const [estado, acao, salvando] = useActionState(salvarReferenciasAcao, {} as EstadoReferencias);
  const erros = estado.erros ?? {};
  return (
    <form onSubmit={enviarSemLimpar(acao)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          rotulo="Taxa do Pix (%)"
          id="ref-pix"
          erro={erros.pix}
          ajuda="Estima a taxa dos pedidos sem o valor real do Mercado Pago."
        >
          <Input
            {...propsDeErro("ref-pix", erros.pix)}
            name="pix"
            defaultValue={pix}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
        <Campo rotulo="Taxa do cartão (%)" id="ref-cartao" erro={erros.cartao}>
          <Input
            {...propsDeErro("ref-cartao", erros.cartao)}
            name="cartao"
            defaultValue={cartao}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
        <Campo
          rotulo="Cotação US$ 1 = R$"
          id="ref-cotacao"
          erro={erros.cotacao}
          ajuda="Até 4 casas. Só vale para as cobranças novas: cada uma guarda a sua."
        >
          <Input
            {...propsDeErro("ref-cotacao", erros.cotacao)}
            name="cotacao"
            defaultValue={cotacao}
            inputMode="decimal"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="touch" variant="outline" disabled={salvando}>
          {salvando && <Loader2 aria-hidden="true" className="animate-spin" />}
          Salvar referências
        </Button>
        {estado.ok && <AvisoSalvo>Referências salvas.</AvisoSalvo>}
      </div>
    </form>
  );
}

const ROTULO_DESPESA = {
  criada: "criada",
  atualizada: "atualizada (era um registro antigo)",
  ja_existia: "já importada antes",
  marcada: "já cadastrada à mão (mantida)",
} as const;

/** Importa as despesas iniciais, com confirmação; mostra o que foi feito em cada uma. */
export function ImportarDespesas() {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<EstadoImportacao>({});
  const [pendente, startTransition] = useTransition();

  function importar() {
    startTransition(async () => {
      const r = await importarDespesasIniciaisAcao().catch((): EstadoImportacao => ({
        erro: "Não foi possível importar. Tente de novo.",
      }));
      setEstado(r);
      setConfirmando(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {confirmando ? (
        <div
          role="group"
          aria-label="Confirmar importação"
          className="flex flex-col gap-2 rounded-lg border p-3"
        >
          <p className="text-sm">
            Importa Vercel Pro, Resend Pro, domínio clicouai.com, Cloudflare R2, tráfego pago e Meta
            Verified com as cobranças informadas. Rodar de novo não duplica nada.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pendente} onClick={importar}>
              {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
              Importar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pendente}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="touch"
          className="w-fit"
          onClick={() => setConfirmando(true)}
        >
          <Upload aria-hidden="true" data-icon="inline-start" />
          Importar despesas iniciais
        </Button>
      )}
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      {estado.resultado && (
        <ul role="status" className="flex flex-col gap-1 text-sm">
          {estado.resultado.map((r) => (
            <li key={r.item}>
              <span className="font-medium">{r.item}</span>: {ROTULO_DESPESA[r.despesa]};{" "}
              {r.cobrancasNovas} cobrança(s) nova(s)
              {r.cobrancasJaExistentes > 0 && `, ${r.cobrancasJaExistentes} já existia(m)`}.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
