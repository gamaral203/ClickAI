"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";

import {
  excluirCobrancaAcao,
  salvarCobrancaAcao,
  type EstadoCobranca,
  type ResultadoAcaoCobranca,
} from "@/app/(admin)/admin/uso/financeiro/acoes";
import { Campo, classeSelect, propsDeErro } from "@/components/painel/campos";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CampoCobranca, StatusCobranca } from "@/lib/financeiro-plataforma";
import { enviarSemLimpar } from "@/lib/formulario";

/** Cobrança com os campos em texto, como o formulário mostra (preparada no servidor). */
export type CobrancaNoFormulario = {
  id: string;
  data: string;
  valor: string;
  moeda: "BRL" | "USD";
  cotacao: string;
  iof: string;
  status: StatusCobranca;
  pagoPeloSaldoMp: boolean;
  observacao: string;
};

/**
 * Lançar ou editar uma cobrança da despesa. Em dólar, a cotação vazia usa a de referência; a
 * usada fica gravada na cobrança. Ao salvar, volta para o histórico (`voltar`).
 */
export function FormularioCobranca({
  assinaturaId,
  cobranca,
  voltar,
  hoje,
  moedaPadrao,
  cotacaoReferencia,
}: {
  assinaturaId: string;
  cobranca?: CobrancaNoFormulario;
  voltar: string;
  hoje: string;
  moedaPadrao: "BRL" | "USD";
  /** "5,3495": mostrada como dica. */
  cotacaoReferencia: string;
}) {
  const router = useRouter();
  const [estado, acao, salvando] = useActionState(salvarCobrancaAcao, {} as EstadoCobranca);
  const erros = estado.erros ?? {};
  const prefixo = cobranca?.id ?? "nova-cobranca";
  const campo = (nome: CampoCobranca) => ({
    ...propsDeErro(`${prefixo}-${nome}`, erros[nome]),
    name: nome,
  });
  const [moeda, setMoeda] = useState(cobranca?.moeda ?? moedaPadrao);

  useEffect(() => {
    if (estado.ok) {
      router.replace(voltar, { scroll: false });
      router.refresh();
    }
  }, [estado.ok, router, voltar]);

  return (
    <form
      onSubmit={enviarSemLimpar(acao)}
      noValidate
      className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby={`${prefixo}-titulo`}
    >
      <input type="hidden" name="assinaturaId" value={assinaturaId} />
      {cobranca && <input type="hidden" name="cobrancaId" value={cobranca.id} />}
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${prefixo}-titulo`} className="text-lg font-semibold">
          {cobranca ? "Editar cobrança" : "Lançar cobrança"}
        </h3>
        <Link
          href={voltar}
          scroll={false}
          aria-label="Fechar o formulário"
          className={buttonVariants({ variant: "ghost", size: "icon-lg" })}
        >
          <X aria-hidden="true" />
        </Link>
      </div>
      {erros.geral && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {erros.geral}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo rotulo="Data" id={`${prefixo}-data`} erro={erros.data}>
          <Input
            {...campo("data")}
            type="date"
            defaultValue={cobranca?.data ?? hoje}
            className="h-11"
          />
        </Campo>
        <Campo
          rotulo="Situação"
          id={`${prefixo}-status`}
          erro={erros.status}
          ajuda="Só a paga conta como dinheiro que saiu."
        >
          <select
            {...campo("status")}
            defaultValue={cobranca?.status ?? "paga"}
            className={classeSelect}
          >
            <option value="paga">Paga</option>
            <option value="pendente">Pendente (venceu e não foi paga)</option>
            <option value="prevista">Prevista (próxima cobrança)</option>
            <option value="provisionada">Provisionada (consumo sem fatura)</option>
          </select>
        </Campo>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <Campo rotulo="Moeda" id={`${prefixo}-moeda`} erro={erros.moeda}>
            <select
              {...campo("moeda")}
              value={moeda}
              onChange={(e) => setMoeda(e.target.value === "USD" ? "USD" : "BRL")}
              className={classeSelect}
            >
              <option value="BRL">R$</option>
              <option value="USD">US$</option>
            </select>
          </Campo>
          <Campo rotulo="Valor" id={`${prefixo}-valor`} erro={erros.valor}>
            <Input
              {...campo("valor")}
              defaultValue={cobranca?.valor}
              inputMode="decimal"
              placeholder="20,00"
              autoComplete="off"
              className="h-11 tabular-nums"
            />
          </Campo>
        </div>
        {moeda === "USD" && (
          <Campo
            rotulo="Cotação usada (US$ 1 = R$)"
            id={`${prefixo}-cotacao`}
            erro={erros.cotacao}
            ajuda={`Vazio: a de referência (${cotacaoReferencia}).`}
          >
            <Input
              {...campo("cotacao")}
              defaultValue={cobranca?.cotacao}
              inputMode="decimal"
              placeholder={cotacaoReferencia}
              autoComplete="off"
              className="h-11 tabular-nums"
            />
          </Campo>
        )}
        <Campo
          rotulo="IOF e taxas de câmbio (R$)"
          id={`${prefixo}-iof`}
          erro={erros.iof}
          ajuda="Somado ao custo, à parte da conversão."
        >
          <Input
            {...campo("iof")}
            defaultValue={cobranca?.iof}
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            className="h-11 tabular-nums"
          />
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input
            type="checkbox"
            name="pagoPeloSaldoMp"
            defaultChecked={cobranca?.pagoPeloSaldoMp ?? false}
            className="size-4"
          />
          Saiu do saldo do Mercado Pago
        </label>
      </div>
      <Campo rotulo="Observação" id={`${prefixo}-observacao`} erro={erros.observacao}>
        <textarea
          {...campo("observacao")}
          defaultValue={cobranca?.observacao}
          maxLength={500}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </Campo>
      <Button type="submit" size="touch" className="w-fit" disabled={salvando}>
        {salvando && <Loader2 aria-hidden="true" className="animate-spin" />}
        {cobranca ? "Salvar cobrança" : "Lançar cobrança"}
      </Button>
    </form>
  );
}

const FALHA: ResultadoAcaoCobranca = { erro: "Não foi possível concluir. Tente de novo." };

/** Editar (pela URL) e excluir, com confirmação na linha. */
export function AcoesCobranca({
  id,
  assinaturaId,
  editar,
}: {
  id: string;
  assinaturaId: string;
  editar: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function excluir() {
    setErro(null);
    startTransition(async () => {
      const r = await excluirCobrancaAcao(id, assinaturaId).catch(() => FALHA);
      if (r.erro) setErro(r.erro);
      else setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">Excluir esta cobrança?</span>
          <Button variant="destructive" size="sm" disabled={pendente} onClick={excluir}>
            {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
            Excluir
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={editar}
            scroll={false}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil aria-hidden="true" />
            Editar
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 aria-hidden="true" />
            Excluir
          </Button>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
